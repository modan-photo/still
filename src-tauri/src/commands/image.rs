use super::task::{self, TaskManager};
use crate::{
    error::AppError,
    image_io::{
        load::inspect_image,
        thumb::{cache_hash, get_or_create_cached, CacheKind, CachedImage},
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

pub(crate) fn supported_image_path(path: &Path) -> bool {
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
pub async fn image_list_directory(
    app: tauri::AppHandle,
    path: String,
) -> Result<Vec<PathBuf>, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        if crate::image_io::source::is_content_uri(Path::new(&path)) {
            return crate::documents::list_directory(&app, &path);
        }
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

#[cfg(test)]
mod tests {
    use std::{fs, path::Path, time::SystemTime};

    use super::{invalidate_cache_files, supported_image_path};

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
