use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RightPanelTab {
    #[default]
    #[serde(alias = "border")]
    Frame,
    #[serde(alias = "crop")]
    Transform,
    #[serde(alias = "watermark")]
    Stamp,
    Exif,
    Collage,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiStateFile {
    #[serde(default)]
    active_right_tab: RightPanelTab,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_frame_preset_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UiStatePatch {
    active_right_tab: Option<RightPanelTab>,
    last_frame_preset_id: Option<String>,
}

#[tauri::command]
pub fn ui_state_load(app: AppHandle) -> Result<UiStateFile, AppError> {
    let path = ui_state_path(&app)?;
    load_ui_state_file(&path)
}

fn load_ui_state_file(path: &Path) -> Result<UiStateFile, AppError> {
    match fs::read(path) {
        Ok(bytes) => {
            let raw: serde_json::Value = serde_json::from_slice(&bytes).map_err(|error| {
                AppError::InvalidInput(format!("invalid ui-state.json: {error}"))
            })?;
            let needs_migration = raw["activeRightTab"] == "crop";
            let state: UiStateFile = serde_json::from_value(raw).map_err(|error| {
                AppError::InvalidInput(format!("invalid ui-state.json: {error}"))
            })?;
            if needs_migration {
                let migrated = serde_json::to_vec_pretty(&state)
                    .map_err(|error| AppError::InvalidInput(error.to_string()))?;
                fs::write(path, migrated)?;
            }
            Ok(state)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(UiStateFile::default()),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub fn ui_state_save(app: AppHandle, state: UiStatePatch) -> Result<(), AppError> {
    let path = ui_state_path(&app)?;
    let mut current = match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| AppError::InvalidInput(format!("invalid ui-state.json: {error}")))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => UiStateFile::default(),
        Err(error) => return Err(error.into()),
    };
    if let Some(active_right_tab) = state.active_right_tab {
        current.active_right_tab = active_right_tab;
    }
    if let Some(last_frame_preset_id) = state.last_frame_preset_id {
        let trimmed = last_frame_preset_id.trim();
        current.last_frame_preset_id = (!trimmed.is_empty()).then(|| trimmed.to_owned());
    }
    let bytes = serde_json::to_vec_pretty(&current)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::write(path, bytes)?;
    Ok(())
}

fn ui_state_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join("ui-state.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ui_state_migrates_legacy_crop_file_on_load() {
        let path = std::env::temp_dir().join(format!(
            "still-ui-state-migration-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::write(
            &path,
            br#"{"activeRightTab":"crop","lastFramePresetId":"user-example"}"#,
        )
        .expect("write legacy UI state");
        let state = load_ui_state_file(&path).expect("load and migrate UI state");
        assert!(matches!(state.active_right_tab, RightPanelTab::Transform));
        let migrated = fs::read(&path).expect("read migrated UI state");
        let value: serde_json::Value = serde_json::from_slice(&migrated).expect("parse UI state");
        assert_eq!(value["activeRightTab"], "transform");
        assert_eq!(value["lastFramePresetId"], "user-example");
        load_ui_state_file(&path).expect("reload migrated UI state");
        assert_eq!(fs::read(&path).expect("read reloaded UI state"), migrated);
        fs::remove_file(path).expect("remove test UI state");
    }

    #[test]
    fn ui_state_uses_the_frontend_field_and_tab_names() {
        let value = serde_json::to_value(UiStateFile {
            active_right_tab: RightPanelTab::Stamp,
            last_frame_preset_id: Some("user-example".into()),
        })
        .expect("serialize UI state");

        assert_eq!(value["activeRightTab"], "stamp");
        assert_eq!(value["lastFramePresetId"], "user-example");
    }

    #[test]
    fn ui_state_accepts_legacy_tab_names() {
        let frame: UiStateFile = serde_json::from_str(r#"{"activeRightTab":"border"}"#)
            .expect("deserialize legacy frame tab");
        let stamp: UiStateFile = serde_json::from_str(r#"{"activeRightTab":"watermark"}"#)
            .expect("deserialize legacy stamp tab");

        assert!(matches!(frame.active_right_tab, RightPanelTab::Frame));
        assert!(matches!(stamp.active_right_tab, RightPanelTab::Stamp));
    }
}
