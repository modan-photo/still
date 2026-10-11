use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::{error::AppError, render::spec::WatermarkSpec};

static SYSTEM_FONTS: OnceLock<Vec<FontInfo>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    family: String,
    path: PathBuf,
    builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WatermarkPreset {
    id: String,
    name: String,
    watermark: WatermarkSpec,
}

#[tauri::command]
pub fn watermark_fonts(app: AppHandle, include_system: bool) -> Result<Vec<FontInfo>, AppError> {
    let mut fonts = Vec::new();
    let resource_fonts = app
        .path()
        .resource_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?
        .join("fonts");
    for (file, family) in [
        ("NotoSansSC-VF.ttf", "Noto Sans SC"),
        ("NotoSansArabic-Variable.ttf", "Noto Sans Arabic"),
        ("NotoSansDevanagari-Variable.ttf", "Noto Sans Devanagari"),
        ("NotoSerifSC-VF.ttf", "Noto Serif SC"),
        ("Inter-Variable.ttf", "Inter"),
        ("PlayfairDisplay-Variable.ttf", "Playfair Display"),
        ("NotoEmoji-Variable.ttf", "Noto Emoji"),
    ] {
        let path = resource_fonts.join(file);
        if path.is_file() {
            fonts.push(FontInfo {
                family: family.into(),
                path,
                builtin: true,
            });
        }
    }
    if include_system {
        fonts.extend(
            SYSTEM_FONTS
                .get_or_init(enumerate_system_fonts)
                .iter()
                .cloned(),
        );
    }
    fonts.sort_by(|left, right| left.family.to_lowercase().cmp(&right.family.to_lowercase()));
    fonts.dedup_by(|left, right| left.family.eq_ignore_ascii_case(&right.family));
    Ok(fonts)
}

#[tauri::command]
pub fn watermark_presets_list(app: AppHandle) -> Result<Vec<WatermarkPreset>, AppError> {
    read_presets(&preset_path(&app)?)
}

#[tauri::command]
pub fn watermark_preset_save(
    app: AppHandle,
    preset: WatermarkPreset,
) -> Result<Vec<WatermarkPreset>, AppError> {
    validate_presets(std::slice::from_ref(&preset))?;
    let path = preset_path(&app)?;
    let mut presets = read_presets(&path)?;
    if let Some(existing) = presets.iter_mut().find(|entry| entry.id == preset.id) {
        *existing = preset;
    } else {
        presets.push(preset);
    }
    write_presets(&path, &presets)?;
    Ok(presets)
}

#[tauri::command]
pub fn watermark_presets_replace(
    app: AppHandle,
    presets: Vec<WatermarkPreset>,
) -> Result<Vec<WatermarkPreset>, AppError> {
    validate_presets(&presets)?;
    write_presets(&preset_path(&app)?, &presets)?;
    Ok(presets)
}

#[tauri::command]
pub fn watermark_preset_delete(
    app: AppHandle,
    id: String,
) -> Result<Vec<WatermarkPreset>, AppError> {
    let path = preset_path(&app)?;
    let mut presets = read_presets(&path)?;
    presets.retain(|entry| entry.id != id);
    write_presets(&path, &presets)?;
    Ok(presets)
}

fn preset_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    fs::create_dir_all(&directory)?;
    Ok(directory.join("watermark-presets.json"))
}

fn read_presets(path: &Path) -> Result<Vec<WatermarkPreset>, AppError> {
    match fs::read(path) {
        Ok(bytes) => {
            let presets: Vec<WatermarkPreset> =
                serde_json::from_slice(&bytes).map_err(|error| {
                    AppError::InvalidInput(format!("invalid watermark-presets.json: {error}"))
                })?;
            validate_presets(&presets).map_err(|error| {
                AppError::InvalidInput(format!("invalid watermark-presets.json: {error}"))
            })?;
            Ok(presets)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.into()),
    }
}

fn write_presets(path: &Path, presets: &[WatermarkPreset]) -> Result<(), AppError> {
    validate_presets(presets)?;
    // Replace must not overwrite an unreadable or semantically invalid source file.
    read_presets(path)?;
    let bytes = serde_json::to_vec_pretty(presets)
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    super::preset_storage::write_bytes_atomic(path, &bytes)
}

fn validate_presets(presets: &[WatermarkPreset]) -> Result<(), AppError> {
    let mut ids = HashSet::new();
    for preset in presets {
        if preset.id.trim().is_empty() || preset.name.trim().is_empty() || !ids.insert(&preset.id) {
            return Err(AppError::InvalidInput(
                "watermark presets need unique IDs and nonempty names".into(),
            ));
        }
        preset
            .watermark
            .validate()
            .map_err(AppError::InvalidInput)?;
    }
    Ok(())
}

fn enumerate_system_fonts() -> Vec<FontInfo> {
    let directories: Vec<PathBuf> = if cfg!(target_os = "windows") {
        vec![PathBuf::from(r"C:\Windows\Fonts")]
    } else if cfg!(target_os = "macos") {
        vec![
            PathBuf::from("/System/Library/Fonts"),
            PathBuf::from("/Library/Fonts"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/share/fonts/truetype"),
            PathBuf::from("/usr/share/fonts/opentype"),
        ]
    };
    let mut result = Vec::new();
    for directory in directories {
        collect_fonts(&directory, &mut result);
    }
    result
}

fn collect_fonts(directory: &Path, output: &mut Vec<FontInfo>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_fonts(&path, output);
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();
        if !extension.eq_ignore_ascii_case("ttf")
            && !extension.eq_ignore_ascii_case("otf")
            && !extension.eq_ignore_ascii_case("ttc")
        {
            continue;
        }
        let family = read_font_family(&path).unwrap_or_else(|| {
            path.file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("Font")
                .replace(['-', '_'], " ")
        });
        output.push(FontInfo {
            family,
            path,
            builtin: false,
        });
    }
}

fn read_font_family(path: &Path) -> Option<String> {
    let data = fs::read(path).ok()?;
    let face = ttf_parser::Face::parse(&data, 0).ok()?;
    for name_id in [
        ttf_parser::name_id::TYPOGRAPHIC_FAMILY,
        ttf_parser::name_id::FAMILY,
    ] {
        if let Some(family) = face
            .names()
            .into_iter()
            .find(|name| name.name_id == name_id && name.is_unicode())
            .and_then(|name| name.to_string())
        {
            return Some(family);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_preset() -> WatermarkPreset {
        serde_json::from_value(serde_json::json!({
            "id": "travel",
            "name": "Travel",
            "watermark": {
                "type": "image",
                "content": "",
                "path": "stamp.png",
                "position": "center",
                "offsetX": 0,
                "offsetY": 0,
                "opacity": 1,
                "rotation": 0,
                "scale": 1
            }
        }))
        .expect("deserialize image preset")
    }

    #[test]
    fn validation_rejects_duplicate_ids_and_invalid_watermark_values() {
        let preset = image_preset();
        assert!(validate_presets(&[preset.clone(), preset.clone()]).is_err());
        let mut invalid = preset;
        invalid.watermark.path = None;
        assert!(validate_presets(&[invalid]).is_err());
    }

    #[test]
    fn write_preserves_a_corrupt_existing_file() {
        let directory = std::env::temp_dir().join(format!(
            "still-watermark-preset-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("watermark-presets.json");
        let original = b"{invalid json";
        fs::write(&path, original).expect("write corrupt preset file");

        assert!(write_presets(&path, &[image_preset()]).is_err());
        assert_eq!(fs::read(&path).expect("read corrupt preset file"), original);

        let duplicate = serde_json::to_vec(&[image_preset(), image_preset()])
            .expect("serialize duplicate presets");
        fs::write(&path, &duplicate).expect("write duplicate presets");
        assert!(read_presets(&path).is_err());
        assert!(write_presets(&path, &[image_preset()]).is_err());
        assert_eq!(fs::read(&path).expect("read duplicate presets"), duplicate);
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
