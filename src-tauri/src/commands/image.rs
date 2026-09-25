use super::task::{self, TaskManager};
use crate::{
    error::AppError,
    image_io::{
        load::inspect_image,
        save::{copy_image_atomic, save_image_atomic},
        thumb::{get_or_create_cached, CacheKind, CachedImage},
    },
    render::{
        pipeline::apply_render_spec,
        spec::{OutputFormat, OutputSpec, RenderSpec},
    },
};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{Manager, State, Window};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    path: PathBuf,
    width: u32,
    height: u32,
    format: String,
    orientation: u8,
    // Paths are converted to asset URLs with convertFileSrc by the frontend.
    preview_url: Option<PathBuf>,
    thumb_url: PathBuf,
}

#[tauri::command]
pub async fn image_load(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    path: String,
) -> Result<ImageMeta, AppError> {
    let root = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "image_load",
        move |token, report| {
            report("metadata", 10);
            let path = std::fs::canonicalize(path)?;
            let info = inspect_image(&path)?;
            task::check(&token)?;
            report("thumbnail", 30);
            let thumb = get_or_create_cached(&path, &root, CacheKind::Thumbnail, &token)?;
            task::check(&token)?;
            Ok(ImageMeta {
                path,
                width: info.width,
                height: info.height,
                format: info.format,
                orientation: info.orientation,
                preview_url: None,
                thumb_url: thumb.path,
            })
        },
    )
    .await
}

#[tauri::command]
pub async fn thumb_get(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    path: String,
    kind: CacheKind,
) -> Result<CachedImage, AppError> {
    let root = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::InvalidInput(e.to_string()))?;
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "thumb_get",
        move |token, report| {
            report("cache", 10);
            get_or_create_cached(&PathBuf::from(path), &root, kind, &token)
        },
    )
    .await
}

#[tauri::command]
pub async fn image_export(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    spec: RenderSpec,
    out_path: String,
) -> Result<(), AppError> {
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "image_export",
        move |token, report| {
            spec.validate().map_err(AppError::InvalidInput)?;
            if spec.adjustments.is_some() {
                return Err(AppError::Unsupported(
                    "adjustment effects are not implemented yet".into(),
                ));
            }
            let source = PathBuf::from(&spec.source.path);
            let destination = PathBuf::from(out_path);
            if spec.output.is_some() || spec.border.is_some() {
                let output = spec
                    .output
                    .clone()
                    .or_else(|| infer_output(&destination))
                    .ok_or_else(|| {
                        AppError::InvalidInput(
                            "edited exports need a .jpg, .jpeg, .png, or .webp destination".into(),
                        )
                    })?;
                if !(1..=100).contains(&output.quality) {
                    return Err(AppError::InvalidInput("quality must be 1..100".into()));
                }
                report("decode", 10);
                let image = apply_render_spec(&source, &spec)?;
                task::check(&token)?;
                report("encode", 60);
                save_image_atomic(&image, &destination, &output, &token)?;
            } else {
                report("copy", 10);
                copy_image_atomic(&source, &destination, &token)?;
            }
            Ok(())
        },
    )
    .await
}

fn infer_output(destination: &std::path::Path) -> Option<OutputSpec> {
    let format = match destination
        .extension()?
        .to_str()?
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => OutputFormat::Jpeg,
        "png" => OutputFormat::Png,
        "webp" => OutputFormat::Webp,
        _ => return None,
    };
    Some(OutputSpec {
        format,
        quality: 92,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StubResult {
    implemented: bool,
    spec: RenderSpec,
}

#[tauri::command]
pub fn image_apply_border(spec: RenderSpec) -> Result<StubResult, AppError> {
    spec.validate().map_err(AppError::InvalidInput)?;
    Ok(StubResult {
        implemented: false,
        spec,
    })
}

#[tauri::command]
pub fn image_apply_watermark(spec: RenderSpec) -> Result<StubResult, AppError> {
    image_apply_border(spec)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::render::spec::OutputFormat;

    use super::infer_output;

    #[test]
    fn edited_export_infers_format_from_destination() {
        assert_eq!(
            infer_output(Path::new("photo.JPG")).map(|output| output.format),
            Some(OutputFormat::Jpeg)
        );
        assert_eq!(
            infer_output(Path::new("photo.png")).map(|output| output.format),
            Some(OutputFormat::Png)
        );
        assert!(infer_output(Path::new("photo.raw")).is_none());
    }
}
