use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::Path,
};

use crate::error::AppError;

const MAX_BUNDLE_BYTES: u64 = 2 * 1024 * 1024;

#[tauri::command]
pub fn preset_bundle_read(path: String) -> Result<String, AppError> {
    let path = Path::new(&path);
    require_json_path(path)?;
    let file = fs::File::open(path)?;
    if file.metadata()?.len() > MAX_BUNDLE_BYTES {
        return Err(AppError::InvalidInput("preset bundle exceeds 2 MiB".into()));
    }
    let mut bytes = Vec::new();
    file.take(MAX_BUNDLE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BUNDLE_BYTES {
        return Err(AppError::InvalidInput("preset bundle exceeds 2 MiB".into()));
    }
    String::from_utf8(bytes)
        .map_err(|_| AppError::InvalidInput("preset bundle must be UTF-8 JSON".into()))
}

#[tauri::command]
pub fn preset_bundle_write(path: String, contents: String) -> Result<(), AppError> {
    let path = Path::new(&path);
    require_json_path(path)?;
    if contents.len() as u64 > MAX_BUNDLE_BYTES {
        return Err(AppError::InvalidInput("preset bundle exceeds 2 MiB".into()));
    }
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
        preset_bundle_write(path.to_string_lossy().into_owned(), "first".into()).unwrap();
        assert!(preset_bundle_write(path.to_string_lossy().into_owned(), "second".into()).is_err());
        assert_eq!(
            preset_bundle_read(path.to_string_lossy().into_owned()).unwrap(),
            "first"
        );
        fs::remove_file(path).unwrap();
    }
}
