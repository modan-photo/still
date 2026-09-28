use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};

use image::{imageops::FilterType, DynamicImage};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::{State, Window};

use super::task::{self, TaskManager};
use crate::{
    error::AppError,
    image_io::save::{save_image_atomic_with_metadata, ExistingDestination},
    render::{
        pipeline::apply_render_spec,
        spec::{OutputFormat, OutputSpec, RenderSpec},
    },
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportOptions {
    pub format: OutputFormat,
    pub quality: u8,
    pub output_directory: String,
    pub size: ExportSize,
    pub naming: ExportNaming,
    pub conflict: ConflictPolicy,
    pub preserve_exif: bool,
    #[serde(default = "default_true")]
    pub preserve_icc: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportSize {
    pub mode: ResizeMode,
    pub long_edge: Option<u32>,
    pub percent: Option<f32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default = "default_true")]
    pub lock_aspect: bool,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResizeMode {
    Original,
    LongEdge,
    Percent,
    Exact,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportNaming {
    pub mode: NamingMode,
    pub suffix: String,
    pub prefix: String,
    pub template: String,
    pub start_number: u32,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NamingMode {
    OriginalSuffix,
    PrefixSequence,
    Template,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictPolicy {
    Skip,
    Overwrite,
    Rename,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFailure {
    pub source_path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSuccess {
    pub source_path: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportReport {
    pub succeeded: usize,
    pub failed: usize,
    pub skipped: usize,
    pub output_directory: String,
    pub successes: Vec<ExportSuccess>,
    pub failures: Vec<ExportFailure>,
}

struct PlannedExport {
    spec: RenderSpec,
    destination: PathBuf,
}

#[tauri::command]
pub async fn image_export_batch(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    specs: Vec<RenderSpec>,
    opts: ExportOptions,
) -> Result<BatchExportReport, AppError> {
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "image_export_batch",
        move |token, report| {
            validate_options(&opts, &specs)?;
            let output_directory = std::fs::canonicalize(&opts.output_directory)?;
            if !output_directory.is_dir() {
                return Err(AppError::InvalidInput(
                    "outputDirectory must be a directory".into(),
                ));
            }
            let (planned, skipped) = plan_exports(specs, &opts, &output_directory)?;
            let total = planned.len() + skipped;
            if total == 0 {
                return Ok(BatchExportReport {
                    succeeded: 0,
                    failed: 0,
                    skipped: 0,
                    output_directory: output_directory.to_string_lossy().into(),
                    successes: vec![],
                    failures: vec![],
                });
            }
            report(&format!("Preparing 0/{total}"), 0);
            let completed = AtomicUsize::new(skipped);
            let workers = std::thread::available_parallelism()
                .map_or(1, usize::from)
                .min(4);
            let pool = rayon::ThreadPoolBuilder::new()
                .num_threads(workers)
                .thread_name(|index| format!("still-export-{index}"))
                .build()
                .map_err(|error| {
                    AppError::InvalidInput(format!("unable to start export workers: {error}"))
                })?;
            let results = pool.install(|| {
                planned
                    .par_iter()
                    .map(|job| {
                        let result = export_one(job, &opts, &token);
                        let done = completed.fetch_add(1, Ordering::Relaxed) + 1;
                        report(
                            &format!("Exporting {done}/{total}"),
                            ((done * 100) / total) as u8,
                        );
                        (job, result)
                    })
                    .collect::<Vec<_>>()
            });

            if token.is_cancelled() {
                return Err(AppError::Cancelled);
            }
            let mut successes = Vec::new();
            let mut failures = Vec::new();
            for (job, result) in results {
                match result {
                    Ok(()) => successes.push(ExportSuccess {
                        source_path: job.spec.source.path.clone(),
                        output_path: job.destination.to_string_lossy().into(),
                    }),
                    Err(error) => failures.push(ExportFailure {
                        source_path: job.spec.source.path.clone(),
                        reason: error.to_string(),
                    }),
                }
            }
            Ok(BatchExportReport {
                succeeded: successes.len(),
                failed: failures.len(),
                skipped,
                output_directory: output_directory.to_string_lossy().into(),
                successes,
                failures,
            })
        },
    )
    .await
}

fn validate_options(opts: &ExportOptions, specs: &[RenderSpec]) -> Result<(), AppError> {
    if specs.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one RenderSpec is required".into(),
        ));
    }
    for spec in specs {
        spec.validate().map_err(AppError::InvalidInput)?;
    }
    if matches!(opts.format, OutputFormat::Jpeg | OutputFormat::Webp)
        && !(1..=100).contains(&opts.quality)
    {
        return Err(AppError::InvalidInput("quality must be 1..100".into()));
    }
    match opts.size.mode {
        ResizeMode::Original => {}
        ResizeMode::LongEdge if opts.size.long_edge.is_some_and(|value| value > 0) => {}
        ResizeMode::Percent
            if opts
                .size
                .percent
                .is_some_and(|value| value.is_finite() && value > 0.0 && value <= 1000.0) => {}
        ResizeMode::Exact
            if opts.size.width.is_some_and(|value| value > 0)
                && opts.size.height.is_some_and(|value| value > 0) => {}
        _ => return Err(AppError::InvalidInput("invalid resize options".into())),
    }
    if matches!(opts.naming.mode, NamingMode::Template) && opts.naming.template.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "naming template must not be empty".into(),
        ));
    }
    Ok(())
}

fn plan_exports(
    specs: Vec<RenderSpec>,
    opts: &ExportOptions,
    directory: &Path,
) -> Result<(Vec<PlannedExport>, usize), AppError> {
    let extension = match opts.format {
        OutputFormat::Jpeg => "jpg",
        OutputFormat::Png => "png",
        OutputFormat::Webp => "webp",
    };
    let mut reserved = HashSet::new();
    let mut planned = Vec::new();
    let mut skipped = 0;
    for (index, spec) in specs.into_iter().enumerate() {
        let source = Path::new(&spec.source.path);
        let name = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let number = opts.naming.start_number.saturating_add(index as u32);
        let stem = match opts.naming.mode {
            NamingMode::OriginalSuffix => format!("{name}{}", opts.naming.suffix),
            NamingMode::PrefixSequence => format!("{}{:04}", opts.naming.prefix, number),
            NamingMode::Template => opts
                .naming
                .template
                .replace("{name}", name)
                .replace("{n}", &number.to_string())
                .replace("{ext}", extension),
        };
        let mut stem = sanitize_stem(&stem);
        let explicit_extension = format!(".{extension}");
        if stem.to_ascii_lowercase().ends_with(&explicit_extension) {
            stem.truncate(stem.len() - explicit_extension.len());
        }
        let mut destination = directory.join(format!("{stem}.{extension}"));
        let key = |path: &Path| path.to_string_lossy().to_ascii_lowercase();
        match opts.conflict {
            ConflictPolicy::Skip
                if destination.exists() || reserved.contains(&key(&destination)) =>
            {
                skipped += 1;
                continue;
            }
            ConflictPolicy::Rename => {
                let mut copy = 1;
                while destination.exists() || reserved.contains(&key(&destination)) {
                    destination = directory.join(format!("{stem} ({copy}).{extension}"));
                    copy += 1;
                }
            }
            ConflictPolicy::Overwrite if reserved.contains(&key(&destination)) => {
                let mut copy = 1;
                while destination.exists() || reserved.contains(&key(&destination)) {
                    destination = directory.join(format!("{stem} ({copy}).{extension}"));
                    copy += 1;
                }
            }
            _ => {}
        }
        let replaces_source = source == destination
            || (destination.exists()
                && std::fs::canonicalize(source).ok() == std::fs::canonicalize(&destination).ok());
        if replaces_source {
            return Err(AppError::InvalidInput(
                "an export destination cannot replace its source image".into(),
            ));
        }
        reserved.insert(key(&destination));
        planned.push(PlannedExport { spec, destination });
    }
    Ok((planned, skipped))
}

fn sanitize_stem(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| {
            if matches!(
                character,
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
            ) || character.is_control()
            {
                '_'
            } else {
                character
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches(['.', ' ']);
    if cleaned.is_empty() {
        "image".into()
    } else {
        cleaned.chars().take(180).collect()
    }
}

fn export_one(
    job: &PlannedExport,
    opts: &ExportOptions,
    token: &tokio_util::sync::CancellationToken,
) -> Result<(), AppError> {
    task::check(token)?;
    if job.spec.adjustments.is_some() {
        return Err(AppError::Unsupported(
            "adjustment effects are not implemented yet".into(),
        ));
    }
    let source = Path::new(&job.spec.source.path);
    let rendered = apply_render_spec(source, &job.spec)?;
    task::check(token)?;
    let resized = resize(rendered, &opts.size);
    task::check(token)?;
    let output = OutputSpec {
        format: opts.format,
        quality: opts.quality,
    };
    save_image_atomic_with_metadata(
        &resized,
        &job.destination,
        &output,
        token,
        if opts.conflict == ConflictPolicy::Overwrite {
            ExistingDestination::Replace
        } else {
            ExistingDestination::Reject
        },
        Some(source),
        opts.preserve_exif,
        opts.preserve_icc,
    )
}

fn resize(image: DynamicImage, size: &ExportSize) -> DynamicImage {
    let (width, height) = (image.width(), image.height());
    let (target_width, target_height) = match size.mode {
        ResizeMode::Original => return image,
        ResizeMode::LongEdge => {
            let edge = size.long_edge.unwrap_or(width.max(height));
            if width >= height {
                (
                    edge,
                    ((height as u64 * edge as u64) / width as u64).max(1) as u32,
                )
            } else {
                (
                    ((width as u64 * edge as u64) / height as u64).max(1) as u32,
                    edge,
                )
            }
        }
        ResizeMode::Percent => {
            let factor = size.percent.unwrap_or(100.0) / 100.0;
            (
                ((width as f32 * factor).round() as u32).max(1),
                ((height as f32 * factor).round() as u32).max(1),
            )
        }
        ResizeMode::Exact if size.lock_aspect => {
            let max_width = size.width.unwrap_or(width);
            let max_height = size.height.unwrap_or(height);
            let factor = (max_width as f64 / width as f64).min(max_height as f64 / height as f64);
            (
                ((width as f64 * factor).round() as u32).max(1),
                ((height as f64 * factor).round() as u32).max(1),
            )
        }
        ResizeMode::Exact => (size.width.unwrap_or(width), size.height.unwrap_or(height)),
    };
    if (target_width, target_height) == (width, height) {
        image
    } else {
        image.resize_exact(target_width, target_height, FilterType::Lanczos3)
    }
}

#[cfg(test)]
mod tests {
    use super::sanitize_stem;
    #[test]
    fn filenames_cannot_escape_the_output_directory() {
        assert_eq!(sanitize_stem("../a:b?c"), ".._a_b_c");
    }
}
