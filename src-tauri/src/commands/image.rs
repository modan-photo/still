use super::task::{self, TaskManager};
use crate::{
    error::AppError,
    image_io::{
        load::inspect_image,
        save::{copy_image_atomic, save_image_atomic},
        thumb::{cache_hash, get_or_create_cached, CacheKind, CachedImage},
    },
    render::{
        pipeline::apply_render_spec,
        spec::{OutputFormat, OutputSpec, RenderSpec},
    },
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{Manager, State, Window};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    path: PathBuf,
    hash: String,
    width: u32,
    height: u32,
    format: String,
    orientation: u8,
    // Paths are converted to asset URLs with convertFileSrc by the frontend.
    preview_url: Option<PathBuf>,
    thumb_url: PathBuf,
}

fn valid_cache_hash(hash: &str) -> bool {
    hash.len() == 16 && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn invalidate_cache_files(cache_root: &Path, hashes: &[String]) -> Result<usize, AppError> {
    let hashes: std::collections::HashSet<_> = hashes.iter().collect();
    if hashes.iter().any(|hash| !valid_cache_hash(hash)) {
        return Err(AppError::InvalidInput(
            "cache hashes must be 16 hexadecimal characters".into(),
        ));
    }

    let mut removed = 0;
    for hash in hashes {
        for directory in ["thumbs", "previews"] {
            let path = cache_root.join(directory).join(format!("{hash}.webp"));
            match std::fs::remove_file(path) {
                Ok(()) => removed += 1,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
    }
    Ok(removed)
}

#[tauri::command]
pub async fn cache_invalidate(window: Window, hashes: Vec<String>) -> Result<usize, AppError> {
    let root = window
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || invalidate_cache_files(&root, &hashes))
        .await
        .map_err(|error| AppError::InvalidInput(format!("unable to invalidate cache: {error}")))?
}

fn supported_image_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tif" | "tiff"
            )
        })
        .unwrap_or(false)
}

#[tauri::command]
pub async fn image_list_directory(path: String) -> Result<Vec<PathBuf>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let directory = std::fs::canonicalize(path)?;
        if !directory.is_dir() {
            return Err(AppError::InvalidInput(
                "selected path is not a directory".into(),
            ));
        }

        let mut paths = Vec::new();
        for entry in std::fs::read_dir(directory)? {
            let entry = entry?;
            if entry.file_type()?.is_file() && supported_image_path(&entry.path()) {
                paths.push(entry.path());
            }
        }
        paths.sort_by_cached_key(|entry| entry.to_string_lossy().to_ascii_lowercase());
        Ok(paths)
    })
    .await
    .map_err(|error| {
        AppError::InvalidInput(format!("unable to scan selected directory: {error}"))
    })?
}

#[tauri::command]
pub async fn image_load(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    path: String,
) -> Result<ImageMeta, AppError> {
    let app = window.app_handle().clone();
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
            let load = |path: &Path| {
                let info = inspect_image(path)?;
                let hash = cache_hash(path)?;
                task::check(&token)?;
                report("thumbnail", 30);
                let thumb = get_or_create_cached(path, &root, CacheKind::Thumbnail, &token)?;
                task::check(&token)?;
                Ok(ImageMeta {
                    path: path.to_path_buf(),
                    hash,
                    width: info.width,
                    height: info.height,
                    format: info.format,
                    orientation: info.orientation,
                    preview_url: None,
                    thumb_url: thumb.path,
                })
            };
            if crate::image_io::source::is_content_uri(Path::new(&path)) {
                report("document", 10);
                let mut meta = crate::image_io::source::prepare(&app, &path, &root, &token, load)?;
                meta.path = PathBuf::from(path);
                Ok(meta)
            } else {
                load(&std::fs::canonicalize(path)?)
            }
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
    use std::{fs, path::Path, time::SystemTime};

    use crate::render::spec::OutputFormat;

    use super::{infer_output, invalidate_cache_files, supported_image_path};

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

    #[test]
    fn directory_import_recognizes_supported_extensions() {
        assert!(supported_image_path(Path::new("photo.JPEG")));
        assert!(supported_image_path(Path::new("photo.webp")));
        assert!(!supported_image_path(Path::new("notes.txt")));
    }

    #[test]
    fn cache_invalidation_is_scoped_to_known_cache_directories() {
        let root = std::env::temp_dir().join(format!(
            "still-cache-invalidate-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("thumbs")).unwrap();
        fs::create_dir_all(root.join("previews")).unwrap();
        let hash = "0123456789abcdef".to_string();
        fs::write(root.join("thumbs").join(format!("{hash}.webp")), b"thumb").unwrap();
        fs::write(
            root.join("previews").join(format!("{hash}.webp")),
            b"preview",
        )
        .unwrap();
        let unrelated = root.join("keep.txt");
        fs::write(&unrelated, b"keep").unwrap();

        assert_eq!(invalidate_cache_files(&root, &[hash]).unwrap(), 2);
        assert!(unrelated.is_file());
        assert!(invalidate_cache_files(&root, &["../escape".into()]).is_err());

        fs::remove_dir_all(root).unwrap();
    }
}
