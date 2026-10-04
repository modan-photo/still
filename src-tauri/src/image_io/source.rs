//! Session-only backing files for Android document-provider sources.
//! The URI remains the public identity; backing paths are never returned to callers.
#[cfg(any(target_os = "android", test))]
use crate::commands::task;
use crate::error::AppError;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};
#[cfg(any(target_os = "android", test))]
use std::{
    fs::File,
    io::{Read, Write},
    sync::atomic::{AtomicU64, Ordering},
};
use tokio_util::sync::CancellationToken;

static SOURCES: OnceLock<Mutex<HashMap<String, BackingFile>>> = OnceLock::new();
#[cfg(any(target_os = "android", test))]
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct BackingFile(PathBuf);
impl Drop for BackingFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

pub fn is_content_uri(path: &Path) -> bool {
    path.to_string_lossy().starts_with("content://")
}

/// Only read operations may resolve a URI to a private copy.
pub fn resolve(path: &Path) -> Result<PathBuf, AppError> {
    if !is_content_uri(path) {
        return Ok(path.to_path_buf());
    }
    SOURCES
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| AppError::InvalidInput("source registry unavailable".into()))?
        .get(path.to_string_lossy().as_ref())
        .map(|file| file.0.clone())
        .ok_or_else(|| {
            AppError::InvalidInput("Document access expired. Select the photo again.".into())
        })
}

#[cfg(any(target_os = "android", test))]
fn stage(
    mut input: impl Read,
    root: &Path,
    token: &CancellationToken,
) -> Result<BackingFile, AppError> {
    task::check(token)?;
    fs::create_dir_all(root)?;
    let path = root.join(format!(
        "{}-{}.image",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut output = File::options().write(true).create_new(true).open(&path)?;
    let file = BackingFile(path);
    // Close the handle before BackingFile's failure cleanup (also on Windows).
    let result = (|| {
        let mut buffer = vec![0; 256 * 1024];
        loop {
            task::check(token)?;
            let length = input.read(&mut buffer)?;
            if length == 0 {
                break;
            }
            output.write_all(&buffer[..length])?;
        }
        output.sync_all()?;
        task::check(token)?;
        super::load::inspect_image(&file.0)?;
        Ok::<_, AppError>(())
    })();
    drop(output);
    result?;
    Ok(file)
}

pub fn prepare<T>(
    app: &tauri::AppHandle,
    uri: &str,
    root: &Path,
    token: &CancellationToken,
    load: impl FnOnce(&Path) -> Result<T, AppError>,
) -> Result<T, AppError> {
    #[cfg(target_os = "android")]
    {
        use tauri_plugin_fs::FsExt;
        task::check(token)?;
        // Serialize document imports so duplicate URI requests share one immutable snapshot.
        let mut sources = SOURCES
            .get_or_init(Default::default)
            .lock()
            .map_err(|_| AppError::InvalidInput("source registry unavailable".into()))?;
        if let Some(file) = sources.get(uri) {
            return load(&file.0);
        }
        let url =
            tauri::Url::parse(uri).map_err(|error| AppError::InvalidInput(error.to_string()))?;
        let mut options = tauri_plugin_fs::OpenOptions::new();
        options.read(true);
        let input = app
            .fs()
            .open(tauri_plugin_fs::FilePath::Url(url), options)?;
        let file = stage(input, &root.join("document-sources"), token)?;
        let result = load(&file.0)?;
        task::check(token)?;
        sources.insert(uri.to_owned(), file);
        Ok(result)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri, root, token, load);
        Err(AppError::Unsupported(
            "Document URIs require Android.".into(),
        ))
    }
}

#[cfg(target_os = "android")]
pub fn cleanup_previous_session(root: &Path) -> std::io::Result<()> {
    // This app-private directory contains only our generated backing files, no persisted URI map.
    let root = root.join("document-sources");
    match fs::remove_dir_all(root) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "still-uri-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }
    #[test]
    fn reads_snapshot_without_changing_uri_identity() {
        let root = root();
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgb8(3, 2)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.set_position(0);
        let file = stage(bytes, &root, &CancellationToken::new()).unwrap();
        let uri = "content://still.test/document/123";
        let backing = file.0.clone();
        SOURCES
            .get_or_init(Default::default)
            .lock()
            .unwrap()
            .insert(uri.into(), file);
        let info = super::super::load::inspect_image(Path::new(uri)).unwrap();
        assert_eq!(info.path, Path::new(uri));
        assert_eq!((info.width, info.height), (3, 2));
        assert_eq!(resolve(Path::new(uri)).unwrap(), backing);
        let token = CancellationToken::new();
        let copied = root.join("export.png");
        super::super::save::copy_image_atomic(Path::new(uri), &copied, &token).unwrap();
        assert_eq!(fs::read(&copied).unwrap(), fs::read(&backing).unwrap());
        assert_eq!(
            super::super::load::decode_image(Path::new(uri))
                .unwrap()
                .width(),
            3
        );
        assert_eq!(
            super::super::thumb::cache_hash(Path::new(uri)).unwrap(),
            super::super::thumb::cache_hash(&backing).unwrap()
        );
        fs::remove_file(copied).unwrap();
        SOURCES.get().unwrap().lock().unwrap().remove(uri);
        assert!(!backing.exists());
        fs::remove_dir(root).unwrap();
        assert!(resolve(Path::new(uri)).is_err());
    }
    #[test]
    fn invalid_image_and_failed_reads_leave_no_backing_file() {
        struct Failed;
        impl Read for Failed {
            fn read(&mut self, _: &mut [u8]) -> std::io::Result<usize> {
                Err(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    "revoked",
                ))
            }
        }
        let root = root();
        assert!(stage(&b"invalid"[..], &root, &CancellationToken::new()).is_err());
        assert!(stage(Failed, &root, &CancellationToken::new()).is_err());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir(root).unwrap();
    }
    #[test]
    fn cancellation_during_copy_cleans_partial_file() {
        struct Cancel(CancellationToken);
        impl Read for Cancel {
            fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
                bytes[0] = 1;
                self.0.cancel();
                Ok(1)
            }
        }
        let root = root();
        let token = CancellationToken::new();
        assert!(matches!(
            stage(Cancel(token.clone()), &root, &token),
            Err(AppError::Cancelled)
        ));
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::remove_dir(root).unwrap();
    }
}
