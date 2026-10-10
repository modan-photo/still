use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::Path,
};

use crate::error::AppError;
use tauri::AppHandle;

const MAX_BUNDLE_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn preset_bundle_read(app: AppHandle, path: String) -> Result<String, AppError> {
    if crate::image_io::source::is_content_uri(Path::new(&path)) {
        return read_document_bundle(&app, &path);
    }
    let path = Path::new(&path);
    require_json_path(path)?;
    let file = fs::File::open(path)?;
    read_bundle(file)
}

#[tauri::command]
pub fn preset_bundle_write(app: AppHandle, path: String, contents: String) -> Result<(), AppError> {
    require_size(contents.len())?;
    if crate::image_io::source::is_content_uri(Path::new(&path)) {
        return write_document_bundle(&app, &path, &contents);
    }
    let path = Path::new(&path);
    write_path_bundle(path, &contents)
}

fn write_path_bundle(path: &Path, contents: &str) -> Result<(), AppError> {
    require_json_path(path)?;
    require_size(contents.len())?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(path)?;
    if let Err(error) = output
        .write_all(contents.as_bytes())
        .and_then(|_| output.sync_all())
    {
        drop(output);
        let _ = fs::remove_file(path);
        return Err(error.into());
    }
    Ok(())
}

fn require_size(bytes: usize) -> Result<(), AppError> {
    if bytes as u64 > MAX_BUNDLE_BYTES {
        Err(AppError::InvalidInput("preset bundle exceeds 2 MiB".into()))
    } else {
        Ok(())
    }
}

fn read_bundle(input: impl Read) -> Result<String, AppError> {
    let mut bytes = Vec::new();
    input.take(MAX_BUNDLE_BYTES + 1).read_to_end(&mut bytes)?;
    require_size(bytes.len())?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::InvalidInput("preset bundle must be UTF-8 JSON".into()))
}

#[cfg(target_os = "android")]
fn document_file(app: &AppHandle, uri: &str, write: bool) -> Result<fs::File, AppError> {
    use tauri_plugin_fs::FsExt;
    let url = tauri::Url::parse(uri).map_err(|error| AppError::InvalidInput(error.to_string()))?;
    let mut options = tauri_plugin_fs::OpenOptions::new();
    if write {
        options.write(true).truncate(true);
    } else {
        options.read(true);
    }
    app.fs()
        .open(tauri_plugin_fs::FilePath::Url(url), options)
        .map_err(Into::into)
}

#[cfg(target_os = "android")]
fn read_document_bundle(app: &AppHandle, uri: &str) -> Result<String, AppError> {
    read_bundle(document_file(app, uri, false)?)
}

#[cfg(not(target_os = "android"))]
fn read_document_bundle(_app: &AppHandle, _uri: &str) -> Result<String, AppError> {
    Err(AppError::Unsupported(
        "Document presets require Android.".into(),
    ))
}

#[cfg(target_os = "android")]
fn write_document_bundle(app: &AppHandle, uri: &str, contents: &str) -> Result<(), AppError> {
    if crate::image_io::source::is_registered(uri) {
        return Err(AppError::InvalidInput(
            "a preset destination cannot replace a source image".into(),
        ));
    }
    // ACTION_CREATE_DOCUMENT has already created an empty destination. Delete it if writing fails.
    let result = (|| {
        let mut output = document_file(app, uri, true)?;
        output.write_all(contents.as_bytes())?;
        output.flush()?;
        Ok::<_, AppError>(())
    })();
    match result {
        Ok(()) => Ok(()),
        Err(error) => match crate::documents::delete(app, uri) {
            Ok(()) => Err(error),
            Err(cleanup) => Err(AppError::DocumentCleanupRequired {
                uri: uri.to_owned(),
                cause: error.to_string(),
                cleanup: cleanup.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "android"))]
fn write_document_bundle(_app: &AppHandle, _uri: &str, _contents: &str) -> Result<(), AppError> {
    Err(AppError::Unsupported(
        "Document presets require Android.".into(),
    ))
}

fn require_json_path(path: &Path) -> Result<(), AppError> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "preset bundle path must end in .json".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_never_overwrites_an_existing_bundle() {
        let path = std::env::temp_dir().join(format!(
            "still-preset-bundle-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        write_path_bundle(&path, "first").unwrap();
        assert!(write_path_bundle(&path, "second").is_err());
        assert_eq!(
            read_bundle(fs::File::open(&path).unwrap()).unwrap(),
            "first"
        );
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn imported_bundle_is_bounded_and_requires_utf8() {
        assert!(read_bundle(&b"\xff"[..]).is_err());
        assert!(read_bundle(vec![b'x'; MAX_BUNDLE_BYTES as usize + 1].as_slice()).is_err());
        assert!(require_size(MAX_BUNDLE_BYTES as usize + 1).is_err());
    }
}
