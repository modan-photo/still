use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

const FRAME_PRESET_FILE_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FrameStyle {
    Solid,
    Gradient,
    Shadow,
    Polaroid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum FrameUnit {
    Px,
    Percent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GradientStop {
    offset: f64,
    color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrameGradient {
    stops: Vec<GradientStop>,
    angle: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrameShadow {
    spread: f64,
    blur: f64,
    offset_y: f64,
    color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrameParams {
    width: f64,
    unit: FrameUnit,
    color: String,
    radius: f64,
    gradient: Option<FrameGradient>,
    shadow: Option<FrameShadow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FramePreset {
    id: String,
    name: String,
    style: FrameStyle,
    params: FrameParams,
    builtin: bool,
    created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FramePresetFile {
    version: u8,
    presets: Vec<FramePreset>,
}

impl Default for FramePresetFile {
    fn default() -> Self {
        Self {
            version: FRAME_PRESET_FILE_VERSION,
            presets: Vec::new(),
        }
    }
}

#[tauri::command]
pub fn frame_presets_load(app: AppHandle) -> Result<FramePresetFile, AppError> {
    read_preset_file(&frame_preset_path(&app)?)
}

#[tauri::command]
pub fn frame_presets_save(app: AppHandle, file: FramePresetFile) -> Result<(), AppError> {
    validate_preset_file(&file)?;
    let path = frame_preset_path(&app)?;
    let bytes = serde_json::to_vec_pretty(&file)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::write(path, bytes)?;
    Ok(())
}

fn frame_preset_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join("frame-presets.json"))
}

fn read_preset_file(path: &Path) -> Result<FramePresetFile, AppError> {
    match fs::read(path) {
        Ok(bytes) => {
            let parsed = serde_json::from_slice::<FramePresetFile>(&bytes).map_err(|error| {
                AppError::InvalidInput(format!("invalid frame-presets.json: {error}"))
            });
            match parsed {
                Ok(file) if validate_preset_file(&file).is_ok() => Ok(file),
                Ok(_) | Err(_) => {
                    backup_invalid_preset_file(path)?;
                    Ok(FramePresetFile::default())
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(FramePresetFile::default())
        }
        Err(error) => Err(error.into()),
    }
}

fn backup_invalid_preset_file(path: &Path) -> Result<(), AppError> {
    let mut backup_name = path.as_os_str().to_os_string();
    backup_name.push(".bak");
    let backup_path = PathBuf::from(backup_name);
    if backup_path.exists() {
        fs::remove_file(&backup_path)?;
    }
    fs::rename(path, backup_path)?;
    Ok(())
}

fn validate_preset_file(file: &FramePresetFile) -> Result<(), AppError> {
    if file.version != FRAME_PRESET_FILE_VERSION {
        return Err(AppError::InvalidInput(format!(
            "unsupported frame preset version: {}",
            file.version
        )));
    }
    for preset in &file.presets {
        if preset.builtin || !preset.id.starts_with("user-") || preset.name.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "frame preset storage may contain only named user presets".into(),
            ));
        }
        validate_number(preset.params.width, "width")?;
        validate_number(preset.params.radius, "radius")?;
        if let Some(gradient) = &preset.params.gradient {
            validate_number(gradient.angle, "gradient angle")?;
            for stop in &gradient.stops {
                validate_number(stop.offset, "gradient stop offset")?;
            }
        }
        if let Some(shadow) = &preset.params.shadow {
            validate_number(shadow.spread, "shadow spread")?;
            validate_number(shadow.blur, "shadow blur")?;
            validate_number(shadow.offset_y, "shadow offset")?;
        }
    }
    Ok(())
}

fn validate_number(value: f64, field: &str) -> Result<(), AppError> {
    if value.is_finite() {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "frame preset {field} must be finite"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_file_uses_version_one() {
        let value =
            serde_json::to_value(FramePresetFile::default()).expect("serialize preset file");
        assert_eq!(value["version"], 1);
        assert_eq!(value["presets"], serde_json::json!([]));
    }

    #[test]
    fn builtins_cannot_be_written_to_user_storage() {
        let file: FramePresetFile = serde_json::from_value(serde_json::json!({
            "version": 1,
            "presets": [{
                "id": "builtin-solid",
                "name": "Built in",
                "style": "solid",
                "params": { "width": 40, "unit": "px", "color": "#FFFFFF", "radius": 0, "gradient": null, "shadow": null },
                "builtin": true,
                "createdAt": 0
            }]
        })).expect("deserialize preset file");
        assert!(validate_preset_file(&file).is_err());
    }

    #[test]
    fn invalid_file_is_backed_up_and_replaced_with_defaults() {
        let directory = std::env::temp_dir().join(format!(
            "still-frame-preset-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("frame-presets.json");
        fs::write(&path, b"{not valid json").expect("write invalid preset file");

        let loaded = read_preset_file(&path).expect("recover invalid preset file");

        assert_eq!(loaded.version, FRAME_PRESET_FILE_VERSION);
        assert!(loaded.presets.is_empty());
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(directory.join("frame-presets.json.bak")).expect("read backup"),
            "{not valid json"
        );
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
