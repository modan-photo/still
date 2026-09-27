use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RightPanelTab {
    #[default]
    #[serde(alias = "border")]
    Frame,
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
}

#[tauri::command]
pub fn ui_state_load(app: AppHandle) -> Result<UiStateFile, AppError> {
    let path = ui_state_path(&app)?;
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| AppError::InvalidInput(format!("invalid ui-state.json: {error}"))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(UiStateFile::default()),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub fn ui_state_save(app: AppHandle, state: UiStateFile) -> Result<(), AppError> {
    let path = ui_state_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&state)
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
    fn ui_state_uses_the_frontend_field_and_tab_names() {
        let value = serde_json::to_value(UiStateFile {
            active_right_tab: RightPanelTab::Stamp,
        })
        .expect("serialize UI state");

        assert_eq!(value["activeRightTab"], "stamp");
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
