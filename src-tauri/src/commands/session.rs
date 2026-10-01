use std::{fs, path::Path};

use tauri::{AppHandle, Manager};

use crate::error::AppError;

const LEGACY_SESSION_FILES: [&str; 4] = [
    "session.json",
    "workspace.json",
    "photos.json",
    "last-spec.json",
];

#[tauri::command]
pub async fn cleanup_legacy_session_files(app: AppHandle) -> Result<(), AppError> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
    tauri::async_runtime::spawn_blocking(move || cleanup_legacy_files(&directory))
        .await
        .map_err(|error| {
            AppError::InvalidInput(format!("unable to clean legacy session files: {error}"))
        })?
}

fn cleanup_legacy_files(directory: &Path) -> Result<(), AppError> {
    // Fixed filenames only; never traverse directories or read stored photo paths.
    for name in LEGACY_SESSION_FILES {
        let path = directory.join(name);
        match fs::remove_file(&path) {
            Ok(()) => eprintln!("Removed legacy session file: {}", path.display()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "still-session-cleanup-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    #[test]
    fn missing_directory_is_not_created() {
        let directory = test_directory();
        cleanup_legacy_files(&directory).expect("clean missing directory");
        assert!(!directory.exists());
    }

    #[test]
    fn removes_only_legacy_files_and_is_idempotent() {
        let directory = test_directory();
        fs::create_dir(&directory).expect("create test directory");
        let retained_files = [
            "frame-presets.json",
            "watermark-presets.json",
            "preferences.json",
            "ui-state.json",
            "original.jpg",
        ];
        for name in retained_files {
            fs::write(directory.join(name), b"retained fixture").expect("write retained file");
        }
        let thumbs = directory.join("thumbs");
        fs::create_dir(&thumbs).expect("create thumbnail directory");
        fs::write(thumbs.join("cached.webp"), b"thumbnail fixture").expect("write thumbnail");
        // A stored source path must never become a deletion target.
        for name in LEGACY_SESSION_FILES {
            fs::write(
                directory.join(name),
                serde_json::to_vec(&serde_json::json!({
                    "photos": [{ "path": directory.join("original.jpg") }]
                }))
                .expect("serialize legacy fixture"),
            )
            .expect("write legacy file");
        }

        cleanup_legacy_files(&directory).expect("clean legacy files");
        cleanup_legacy_files(&directory).expect("repeat cleanup");
        for name in LEGACY_SESSION_FILES {
            assert!(!directory.join(name).exists());
        }
        for name in retained_files {
            assert_eq!(
                fs::read(directory.join(name)).expect("read retained file"),
                b"retained fixture"
            );
            fs::remove_file(directory.join(name)).expect("remove retained test fixture");
        }
        assert_eq!(
            fs::read(thumbs.join("cached.webp")).expect("read thumbnail"),
            b"thumbnail fixture"
        );
        fs::remove_file(thumbs.join("cached.webp")).expect("remove test thumbnail");
        fs::remove_dir(thumbs).expect("remove thumbnail test directory");
        fs::remove_dir(directory).expect("remove test directory");
    }

    #[test]
    fn never_recursively_removes_a_directory_with_a_legacy_filename() {
        let directory = test_directory();
        let nested = directory.join("session.json");
        fs::create_dir_all(&nested).expect("create nested test directory");
        let original = nested.join("original.jpg");
        fs::write(&original, b"retained fixture").expect("write nested fixture");

        assert!(cleanup_legacy_files(&directory).is_err());
        assert_eq!(
            fs::read(&original).expect("read nested fixture"),
            b"retained fixture"
        );

        fs::remove_file(original).expect("remove nested test fixture");
        fs::remove_dir(nested).expect("remove nested test directory");
        fs::remove_dir(directory).expect("remove test directory");
    }
}
