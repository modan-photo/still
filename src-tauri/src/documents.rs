use crate::error::AppError;
use std::path::PathBuf;
#[cfg(target_os = "android")]
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};
#[cfg(target_os = "android")]
use tokio_util::sync::CancellationToken;

#[cfg(target_os = "android")]
struct Documents(tauri::plugin::PluginHandle<tauri::Wry>);

pub fn init() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("documents")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                app.manage(Documents(
                    api.register_android_plugin("dev.still.app", "DocumentsPlugin")?,
                ));
            }
            let _ = (app, api);
            Ok(())
        })
        .build()
}

#[cfg(any(target_os = "android", test))]
#[derive(serde::Deserialize)]
struct DocumentEntry {
    uri: String,
    name: String,
    mime: String,
}

#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct UriResponse {
    uri: String,
}
#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct NameResponse {
    name: String,
}
#[cfg(target_os = "android")]
#[derive(serde::Deserialize)]
struct RenameResponse {
    uri: String,
    name: String,
}

#[cfg(target_os = "android")]
fn plugin<T: serde::de::DeserializeOwned>(
    app: &tauri::AppHandle,
    command: &str,
    payload: serde_json::Value,
) -> Result<T, AppError> {
    use tauri::Manager;
    app.state::<Documents>()
        .0
        .run_mobile_plugin(command, payload)
        .map_err(|error| AppError::InvalidInput(error.to_string()))
}

#[cfg(target_os = "android")]
pub fn list_all(app: &tauri::AppHandle, tree: &str) -> Result<Vec<(String, String)>, AppError> {
    #[derive(serde::Deserialize)]
    struct Response {
        entries: Vec<DocumentEntry>,
    }
    let response: Response = plugin(app, "listDirectory", serde_json::json!({"uri":tree}))?;
    Ok(response
        .entries
        .into_iter()
        .map(|entry| (entry.name, entry.uri))
        .collect())
}

#[cfg(target_os = "android")]
pub fn display_name(app: &tauri::AppHandle, uri: &str) -> Result<String, AppError> {
    Ok(plugin::<NameResponse>(app, "documentName", serde_json::json!({"uri":uri}))?.name)
}

#[cfg(target_os = "android")]
pub fn delete(app: &tauri::AppHandle, uri: &str) -> Result<(), AppError> {
    let _: serde_json::Value = plugin(app, "deleteDocument", serde_json::json!({"uri":uri}))?;
    Ok(())
}

#[cfg(target_os = "android")]
pub fn publish(
    app: &tauri::AppHandle,
    tree: &str,
    staged: &Path,
    name: &str,
    mime: &str,
    token: &CancellationToken,
) -> Result<String, AppError> {
    crate::commands::task::check(token)?;
    let pending = format!(
        ".still-pending-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| AppError::InvalidInput(error.to_string()))?
            .as_nanos()
    );
    let created: UriResponse = plugin(
        app,
        "createDocument",
        serde_json::json!({"tree":tree,"name":pending,"mime":mime}),
    )?;
    let mut active_uri = created.uri;
    let commit = (|| {
        copy_staged(app, staged, &active_uri, token)?;
        let result: RenameResponse = plugin(
            app,
            "renameDocument",
            serde_json::json!({"uri":active_uri,"name":name}),
        )?;
        active_uri = result.uri;
        if result.name != name {
            return Err(AppError::InvalidInput(format!(
                "document provider changed output name to {}",
                result.name
            )));
        }
        Ok(active_uri.clone())
    })();
    match commit {
        Ok(uri) => Ok(uri),
        Err(error) => match delete(app, &active_uri) {
            Ok(()) => Err(error),
            Err(cleanup) => Err(AppError::DocumentCleanupRequired {
                uri: active_uri,
                cause: error.to_string(),
                cleanup: cleanup.to_string(),
            }),
        },
    }
}

#[cfg(target_os = "android")]
static STAGED_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[cfg(target_os = "android")]
pub struct StagedImage(PathBuf);

#[cfg(target_os = "android")]
impl StagedImage {
    pub fn path(&self) -> &Path {
        &self.0
    }
}

#[cfg(target_os = "android")]
impl Drop for StagedImage {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

#[cfg(target_os = "android")]
pub fn stage_image(
    app: &tauri::AppHandle,
    image: &image::DynamicImage,
    output: &crate::render::spec::OutputSpec,
    metadata_source: Option<&Path>,
    preserve_exif: bool,
    preserve_icc: bool,
    token: &CancellationToken,
) -> Result<StagedImage, AppError> {
    use tauri::Manager;
    let root = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?
        .join("document-exports");
    fs::create_dir_all(&root)?;
    let extension = match output.format {
        crate::render::spec::OutputFormat::Jpeg => "jpg",
        crate::render::spec::OutputFormat::Png => "png",
        crate::render::spec::OutputFormat::Webp => "webp",
    };
    let staged = StagedImage(root.join(format!(
        "still-{}-{}.{}",
        std::process::id(),
        STAGED_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        extension
    )));
    crate::image_io::save::save_image_atomic_with_metadata(
        image,
        staged.path(),
        output,
        token,
        crate::image_io::save::ExistingDestination::Reject,
        metadata_source,
        preserve_exif,
        preserve_icc,
    )?;
    Ok(staged)
}

#[cfg(target_os = "android")]
pub fn cleanup_staged(root: &Path) -> std::io::Result<()> {
    let root = root.join("document-exports");
    match fs::remove_dir_all(root) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(target_os = "android")]
fn copy_staged(
    app: &tauri::AppHandle,
    staged: &Path,
    uri: &str,
    token: &CancellationToken,
) -> Result<(), AppError> {
    use tauri_plugin_fs::FsExt;
    if !uri.starts_with("content://") {
        return Err(AppError::InvalidInput("expected a document URI".into()));
    }
    crate::commands::task::check(token)?;
    let url = tauri::Url::parse(uri).map_err(|error| AppError::InvalidInput(error.to_string()))?;
    let mut options = tauri_plugin_fs::OpenOptions::new();
    options.write(true).truncate(true);
    let mut output = app
        .fs()
        .open(tauri_plugin_fs::FilePath::Url(url), options)?;
    let mut input = fs::File::open(staged)?;
    let mut buffer = vec![0; 256 * 1024];
    loop {
        crate::commands::task::check(token)?;
        let count = input.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        output.write_all(&buffer[..count])?;
    }
    output.flush()?;
    drop(output);
    crate::commands::task::check(token)?;
    Ok(())
}

/// The Save dialog's ACTION_CREATE_DOCUMENT has already created a new blank URI.
#[cfg(target_os = "android")]
pub fn write_created(
    app: &tauri::AppHandle,
    staged: &Path,
    uri: &str,
    token: &CancellationToken,
) -> Result<String, AppError> {
    if crate::image_io::source::is_registered(uri) {
        return Err(AppError::InvalidInput(
            "an export destination cannot replace its source image".into(),
        ));
    }
    copy_staged(app, staged, uri, token)?;
    Ok(uri.to_owned())
}

#[cfg(any(target_os = "android", test))]
fn image_entries(mut entries: Vec<DocumentEntry>) -> Vec<PathBuf> {
    entries.retain(|entry| {
        entry.uri.starts_with("content://")
            && entry.mime != "vnd.android.document/directory"
            && (crate::commands::image::supported_image_path(std::path::Path::new(&entry.name))
                || matches!(
                    entry.mime.as_str(),
                    "image/jpeg"
                        | "image/png"
                        | "image/webp"
                        | "image/gif"
                        | "image/bmp"
                        | "image/tiff"
                ))
    });
    entries.sort_by_cached_key(|entry| (entry.name.to_lowercase(), entry.uri.clone()));
    let mut seen = std::collections::HashSet::new();
    entries
        .into_iter()
        .filter(|entry| seen.insert(entry.uri.clone()))
        .map(|entry| PathBuf::from(entry.uri))
        .collect()
}

#[tauri::command]
pub async fn document_pick_directory(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        #[derive(serde::Deserialize)]
        struct Response {
            uri: Option<String>,
        }
        tauri::async_runtime::spawn_blocking(move || {
            app.state::<Documents>()
                .0
                .run_mobile_plugin::<Response>("pickDirectory", ())
                .map(|response| response.uri)
                .map_err(|error| AppError::InvalidInput(error.to_string()))
        })
        .await
        .map_err(|error| AppError::InvalidInput(error.to_string()))?
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err(AppError::Unsupported(
            "Document folders require Android.".into(),
        ))
    }
}

pub fn list_directory(app: &tauri::AppHandle, uri: &str) -> Result<Vec<PathBuf>, AppError> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        #[derive(serde::Deserialize)]
        struct Response {
            entries: Vec<DocumentEntry>,
        }
        app.state::<Documents>()
            .0
            .run_mobile_plugin::<Response>("listDirectory", serde_json::json!({"uri": uri}))
            .map(|response| image_entries(response.entries))
            .map_err(|error| AppError::InvalidInput(error.to_string()))
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, uri);
        Err(AppError::Unsupported(
            "Document folders require Android.".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn filters_files_using_provider_metadata_and_preserves_opaque_uris() {
        let entry = |id: &str, name: &str, mime: &str| DocumentEntry {
            uri: id.into(),
            name: name.into(),
            mime: mime.into(),
        };
        let result = image_entries(vec![
            entry("content://p/document/2%2Fopaque", "b", "image/png"),
            entry(
                "content://p/document/1",
                "A.JPG",
                "application/octet-stream",
            ),
            entry("content://p/document/1", "A.JPG", "image/jpeg"),
            entry(
                "content://p/document/3",
                "folder.jpg",
                "vnd.android.document/directory",
            ),
            entry("content://p/document/4", "photo.heic", "image/heic"),
            entry("file:///outside.png", "outside.png", "image/png"),
        ]);
        assert_eq!(
            result,
            vec![
                PathBuf::from("content://p/document/1"),
                PathBuf::from("content://p/document/2%2Fopaque")
            ]
        );
    }
}
