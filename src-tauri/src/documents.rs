use crate::error::AppError;
use std::path::PathBuf;

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
