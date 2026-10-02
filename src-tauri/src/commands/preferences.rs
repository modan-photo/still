use std::{fs, path::Path};

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

const SESSION_FIELDS: &[&str] = &[
    "lastFramePresetId",
    "lastWatermarkPresetId",
    "lastUsedSpec",
    "lastAppliedSpec",
    "photoList",
    "lastImportPath",
    "activeRightTab",
    "rightPanelCollapsed",
    "inspectorOpen",
    "gridPanelOpen",
    "isCollageMode",
    "photos",
    "renderSpecs",
    "collageDraft",
    "undoStack",
    "currentPhotoId",
    "selectedId",
    "selectedIds",
];

#[tauri::command]
pub async fn migrate_preferences_if_needed(app: AppHandle) -> Result<(), AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || migrate_preference_files(&directory))
        .await
        .map_err(|error| {
            AppError::InvalidInput(format!("unable to migrate preference files: {error}"))
        })?
}

fn migrate_preference_files(directory: &Path) -> Result<(), AppError> {
    let mut first_error = None;
    for (name, recover_invalid) in [("preferences.json", false), ("ui-state.json", true)] {
        if let Err(error) = migrate_file(&directory.join(name), recover_invalid) {
            eprintln!("Unable to migrate {name}: {error}");
            first_error.get_or_insert(error);
        }
    }
    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn migrate_file(path: &Path, recover_invalid: bool) -> Result<(), AppError> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.into()),
        Ok(metadata) if !metadata.file_type().is_file() => {
            return Err(AppError::InvalidInput(format!(
                "preference migration requires a regular file: {}",
                path.display()
            )));
        }
        Ok(_) => {}
    }

    let bytes = fs::read(path)?;
    let parsed = serde_json::from_slice::<Map<String, Value>>(&bytes);
    let mut fields = match parsed {
        Ok(fields) => fields,
        Err(_) if recover_invalid => Map::new(),
        Err(error) => {
            return Err(AppError::InvalidInput(format!(
                "invalid preferences file {}: {error}",
                path.display()
            )));
        }
    };
    let mut changed = fields.get("version") != Some(&Value::from(2));
    for field in SESSION_FIELDS {
        changed |= fields.remove(*field).is_some();
    }
    if !changed {
        return Ok(());
    }
    fields.insert("version".into(), Value::from(2));
    let bytes = serde_json::to_vec_pretty(&fields)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::write(path, bytes)?;
    eprintln!("Migrated preference file to version 2: {}", path.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn test_directory() -> PathBuf {
        static SEQUENCE: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "still-preference-migration-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos(),
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn migration_preserves_resources_and_removes_session_fields_from_both_files() {
        let directory = test_directory();
        fs::create_dir(&directory).expect("create test directory");
        let retained = serde_json::json!({
            "version": 2,
            "theme": "dark",
            "language": "en",
            "shortcuts": { "import": "Ctrl+O" },
            "defaultExportDirectory": "exports",
            "recentExportDirectories": ["exports", "other"],
            "window": { "width": 1100, "height": 760 },
            "futurePreference": true
        });
        let mut legacy = retained.as_object().expect("retained object").clone();
        legacy.insert("version".into(), Value::from(1));
        for field in SESSION_FIELDS {
            legacy.insert((*field).into(), serde_json::json!({ "legacy": true }));
        }
        for name in ["preferences.json", "ui-state.json"] {
            fs::write(directory.join(name), serde_json::to_vec(&legacy).unwrap()).unwrap();
        }
        for name in [
            "frame-presets.json",
            "watermark-presets.json",
            "original.jpg",
        ] {
            fs::write(directory.join(name), b"retained fixture").unwrap();
        }

        migrate_preference_files(&directory).expect("migrate files");
        for name in ["preferences.json", "ui-state.json"] {
            let path = directory.join(name);
            let first = fs::read(&path).unwrap();
            assert_eq!(serde_json::from_slice::<Value>(&first).unwrap(), retained);
            migrate_file(&path, name == "ui-state.json").expect("repeat migration");
            assert_eq!(fs::read(&path).unwrap(), first);
            fs::remove_file(path).unwrap();
        }
        for name in [
            "frame-presets.json",
            "watermark-presets.json",
            "original.jpg",
        ] {
            let path = directory.join(name);
            assert_eq!(fs::read(&path).unwrap(), b"retained fixture");
            fs::remove_file(path).unwrap();
        }
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn missing_files_are_not_created() {
        let directory = test_directory();
        migrate_preference_files(&directory).expect("migrate absent files");
        assert!(!directory.exists());
    }

    #[test]
    fn version_two_with_legacy_fields_is_still_cleaned() {
        let directory = test_directory();
        fs::create_dir(&directory).unwrap();
        let path = directory.join("preferences.json");
        fs::write(
            &path,
            br#"{"version":2,"theme":"dark","lastFramePresetId":"old"}"#,
        )
        .unwrap();
        migrate_file(&path, false).unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),
            serde_json::json!({ "version": 2, "theme": "dark" })
        );
        fs::remove_file(path).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn malformed_preferences_are_preserved_while_ui_state_is_recovered() {
        let directory = test_directory();
        fs::create_dir(&directory).unwrap();
        let preferences = directory.join("preferences.json");
        let ui_state = directory.join("ui-state.json");
        fs::write(&preferences, b"invalid preferences").unwrap();
        fs::write(&ui_state, b"invalid UI state").unwrap();
        assert!(migrate_preference_files(&directory).is_err());
        assert_eq!(fs::read(&preferences).unwrap(), b"invalid preferences");
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(&ui_state).unwrap()).unwrap(),
            serde_json::json!({ "version": 2 })
        );
        fs::remove_file(preferences).unwrap();
        fs::remove_file(ui_state).unwrap();
        fs::remove_dir(directory).unwrap();
    }
}
