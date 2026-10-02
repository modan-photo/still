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
pub struct ExportItemResult {
    pub item_id: String,
    pub source_path: String,
    pub output_path: Option<String>,
    pub status: String,
    pub code: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportItem {
    pub item_id: String,
    pub sequence_index: u32,
    pub spec: RenderSpec,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchExportReport {
    pub succeeded: usize,
    pub failed: usize,
    pub skipped: usize,
    pub cancelled: usize,
    pub cancellation_requested: bool,
    pub output_directory: String,
    pub results: Vec<ExportItemResult>,
}

struct PlannedExport {
    item: ExportItem,
    destination: PathBuf,
}

#[tauri::command]
pub async fn image_export_batch(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    items: Vec<ExportItem>,
    opts: ExportOptions,
) -> Result<BatchExportReport, AppError> {
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "image_export_batch",
        move |token, report| export_batch(items, opts, token, report.as_ref()),
    )
    .await
}

fn export_batch(
    items: Vec<ExportItem>,
    opts: ExportOptions,
    token: tokio_util::sync::CancellationToken,
    report: &(dyn Fn(&str, u8) + Send + Sync),
) -> Result<BatchExportReport, AppError> {
    validate_options(&opts, &items)?;
    let output_directory = std::fs::canonicalize(&opts.output_directory)?;
    if !output_directory.is_dir() {
        return Err(AppError::InvalidInput(
            "outputDirectory must be a directory".into(),
        ));
    }
    let (planned, mut item_results) = plan_exports(items, &opts, &output_directory)?;
    let total = planned.len() + item_results.len();
    report(&format!("Preparing 0/{total}"), 0);
    let completed = AtomicUsize::new(item_results.len());
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

    for (job, result) in results {
        item_results.push(item_result(job, result));
    }
    Ok(batch_report(
        item_results,
        &output_directory,
        token.is_cancelled(),
    ))
}

fn validate_options(opts: &ExportOptions, items: &[ExportItem]) -> Result<(), AppError> {
    if items.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one RenderSpec is required".into(),
        ));
    }
    let mut ids = HashSet::new();
    for item in items {
        if item.item_id.trim().is_empty() || !ids.insert(&item.item_id) {
            return Err(AppError::InvalidInput(
                "export item IDs must be nonempty and unique".into(),
            ));
        }
        item.spec.validate().map_err(AppError::InvalidInput)?;
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
    items: Vec<ExportItem>,
    opts: &ExportOptions,
    directory: &Path,
) -> Result<(Vec<PlannedExport>, Vec<ExportItemResult>), AppError> {
    let extension = match opts.format {
        OutputFormat::Jpeg => "jpg",
        OutputFormat::Png => "png",
        OutputFormat::Webp => "webp",
    };
    let mut reserved = HashSet::new();
    let mut planned = Vec::new();
    let mut skipped = Vec::new();
    for item in items {
        let spec = &item.spec;
        let source = Path::new(&spec.source.path);
        let name = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("image");
        let number = opts.naming.start_number.saturating_add(item.sequence_index);
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
                skipped.push(ExportItemResult {
                    item_id: item.item_id.clone(),
                    source_path: spec.source.path.clone(),
                    output_path: Some(destination.to_string_lossy().into()),
                    status: "skipped".into(),
                    code: None,
                    message: None,
                });
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
        planned.push(PlannedExport { item, destination });
    }
    Ok((planned, skipped))
}

fn item_result(job: &PlannedExport, result: Result<(), AppError>) -> ExportItemResult {
    let (status, code, message) = match result {
        Ok(()) => ("success", None, None),
        Err(error) => (
            if matches!(error, AppError::Cancelled) {
                "cancelled"
            } else {
                "failed"
            },
            Some(error.code().to_owned()),
            Some(error.to_string()),
        ),
    };
    ExportItemResult {
        item_id: job.item.item_id.clone(),
        source_path: job.item.spec.source.path.clone(),
        output_path: Some(job.destination.to_string_lossy().into()),
        status: status.into(),
        code,
        message,
    }
}

fn batch_report(
    results: Vec<ExportItemResult>,
    directory: &Path,
    cancellation_requested: bool,
) -> BatchExportReport {
    let count = |status: &str| results.iter().filter(|item| item.status == status).count();
    BatchExportReport {
        succeeded: count("success"),
        failed: count("failed"),
        skipped: count("skipped"),
        cancelled: count("cancelled"),
        cancellation_requested,
        output_directory: directory.to_string_lossy().into(),
        results,
    }
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
    let source = Path::new(&job.item.spec.source.path);
    let rendered = apply_render_spec(source, &job.item.spec)?;
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
    use super::*;
    use tokio_util::sync::CancellationToken;

    fn fixture() -> (PathBuf, ExportOptions, Vec<ExportItem>) {
        let directory = std::env::temp_dir().join(format!(
            "still-batch-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let source = directory.join("source.png");
        image::RgbaImage::from_pixel(20, 20, image::Rgba([20, 30, 40, 255]))
            .save(&source)
            .unwrap();
        let opts = serde_json::from_value(serde_json::json!({
            "format": "png", "quality": 100, "outputDirectory": directory,
            "size": { "mode": "original", "longEdge": null, "percent": null, "width": null, "height": null, "lockAspect": true },
            "naming": { "mode": "prefixSequence", "suffix": "_export", "prefix": "still_", "template": "{name}_{n}", "startNumber": 3 },
            "conflict": "rename", "preserveExif": false, "preserveIcc": false,
        })).unwrap();
        let spec: RenderSpec = serde_json::from_value(serde_json::json!({
            "version": 1, "source": { "path": source, "width": 20, "height": 20 }
        }))
        .unwrap();
        let items = vec![
            ExportItem {
                item_id: "first".into(),
                sequence_index: 0,
                spec: spec.clone(),
            },
            ExportItem {
                item_id: "second".into(),
                sequence_index: 1,
                spec,
            },
        ];
        (directory, opts, items)
    }

    #[test]
    fn cancellation_after_commit_keeps_the_success_report() {
        let (directory, opts, mut items) = fixture();
        items.truncate(1);
        let token = CancellationToken::new();
        let result = export_batch(items, opts, token.clone(), &|stage, _| {
            if stage.starts_with("Exporting") {
                token.cancel();
            }
        })
        .unwrap();
        assert!(result.cancellation_requested);
        assert_eq!(result.succeeded, 1);
        assert_eq!(result.results[0].item_id, "first");
        assert!(Path::new(result.results[0].output_path.as_ref().unwrap()).is_file());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancelled_items_are_reported_separately_from_failures() {
        let (directory, opts, items) = fixture();
        let token = CancellationToken::new();
        token.cancel();
        let result = export_batch(items, opts, token, &|_, _| {}).unwrap();
        assert_eq!(result.cancelled, 2);
        assert_eq!(result.failed, 0);
        assert!(result
            .results
            .iter()
            .all(|item| item.code.as_deref() == Some("cancelled")));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn same_source_partial_failure_preserves_ids_and_error_codes() {
        let (directory, opts, items) = fixture();
        // A directory at one output path makes that item fail while its sibling succeeds.
        let (planned, _) = plan_exports(items.clone(), &opts, &directory).unwrap();
        std::fs::create_dir(&planned[1].destination).unwrap();
        let mut opts = opts;
        opts.conflict = ConflictPolicy::Overwrite;
        let result = export_batch(items, opts, CancellationToken::new(), &|_, _| {}).unwrap();
        assert_eq!(result.succeeded, 1);
        assert_eq!(result.failed, 1);
        let failed = result
            .results
            .iter()
            .find(|item| item.status == "failed")
            .unwrap();
        assert_eq!(failed.item_id, "second");
        assert_eq!(failed.code.as_deref(), Some("invalid_input"));
        assert!(failed.message.is_some());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn retry_retains_original_sequence_number_and_skip_has_an_identity() {
        let (directory, mut opts, mut items) = fixture();
        items.remove(0);
        items[0].sequence_index = 9;
        let (planned, _) = plan_exports(items.clone(), &opts, &directory).unwrap();
        assert!(planned[0].destination.ends_with("still_0012.png"));
        std::fs::write(&planned[0].destination, b"existing").unwrap();
        opts.conflict = ConflictPolicy::Skip;
        let result = export_batch(items, opts, CancellationToken::new(), &|_, _| {}).unwrap();
        assert_eq!(result.skipped, 1);
        assert_eq!(result.results[0].item_id, "second");
        assert_eq!(std::fs::read(&planned[0].destination).unwrap(), b"existing");
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn duplicate_item_ids_and_source_overwrite_are_rejected() {
        let (directory, mut opts, mut items) = fixture();
        items[1].item_id = items[0].item_id.clone();
        assert!(validate_options(&opts, &items).is_err());
        items.truncate(1);
        items[0].item_id.clear();
        assert!(validate_options(&opts, &items).is_err());
        items[0].item_id = "valid".into();
        opts.naming.mode = NamingMode::OriginalSuffix;
        opts.naming.suffix.clear();
        opts.conflict = ConflictPolicy::Overwrite;
        let before = std::fs::read(&items[0].spec.source.path).unwrap();
        assert!(plan_exports(items.clone(), &opts, &directory).is_err());
        assert_eq!(std::fs::read(&items[0].spec.source.path).unwrap(), before);
        std::fs::remove_dir_all(directory).unwrap();
    }
    #[test]
    fn filenames_cannot_escape_the_output_directory() {
        assert_eq!(sanitize_stem("../a:b?c"), ".._a_b_c");
    }
}
