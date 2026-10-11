use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::{error::AppError, image_io::save::rename_no_replace};

static FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy)]
enum FilePurpose {
    Preset,
    Preference,
}

pub(super) fn write_bytes_atomic(destination: &Path, bytes: &[u8]) -> Result<(), AppError> {
    write_bytes_for(destination, bytes, FilePurpose::Preset)
}

pub(super) fn write_preferences_atomic(destination: &Path, bytes: &[u8]) -> Result<(), AppError> {
    write_bytes_for(destination, bytes, FilePurpose::Preference)
}

fn write_bytes_for(destination: &Path, bytes: &[u8], purpose: FilePurpose) -> Result<(), AppError> {
    let (mut staged, mut file) = StagedFile::create(destination)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    publish_with_rollback_for(&mut staged, destination, rename_no_replace, purpose)
}

#[cfg(test)]
fn publish_with_rollback(
    staged: &mut StagedFile,
    destination: &Path,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
) -> Result<(), AppError> {
    publish_with_rollback_for(staged, destination, &mut rename, FilePurpose::Preset)
}

fn publish_with_rollback_for(
    staged: &mut StagedFile,
    destination: &Path,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
    purpose: FilePurpose,
) -> Result<(), AppError> {
    if !destination.exists() {
        rename(staged.path(), destination)?;
        staged.disarm();
        return Ok(());
    }
    if !destination.is_file() {
        return Err(AppError::InvalidInput(format!(
            "{} destination is not a file",
            purpose.label()
        )));
    }

    let backup = sibling_path(destination, "backup");
    rename(destination, &backup)?;
    match rename(staged.path(), destination) {
        Ok(()) => {
            staged.disarm();
            if let Err(error) = fs::remove_file(&backup) {
                eprintln!(
                    "unable to remove {} backup {}: {error}",
                    purpose.label(),
                    backup.display()
                );
            }
            Ok(())
        }
        Err(commit_error) => match rename(&backup, destination) {
            Ok(()) => Err(commit_error.into()),
            Err(rollback_error) => Err(purpose.recovery_error(
                backup.to_string_lossy().into_owned(),
                commit_error.to_string(),
                rollback_error.to_string(),
            )),
        },
    }
}

impl FilePurpose {
    fn label(self) -> &'static str {
        match self {
            Self::Preset => "preset",
            Self::Preference => "preference",
        }
    }

    fn recovery_error(
        self,
        backup_path: String,
        commit_error: String,
        rollback_error: String,
    ) -> AppError {
        match self {
            Self::Preset => AppError::PresetRecoveryRequired {
                backup_path,
                commit_error,
                rollback_error,
            },
            Self::Preference => AppError::PreferenceRecoveryRequired {
                backup_path,
                commit_error,
                rollback_error,
            },
        }
    }
}

fn sibling_path(destination: &Path, label: &str) -> PathBuf {
    let sequence = FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let mut name = destination.as_os_str().to_os_string();
    name.push(format!(".still-{label}-{}-{sequence}", std::process::id()));
    PathBuf::from(name)
}

struct StagedFile {
    path: PathBuf,
    armed: bool,
}

impl StagedFile {
    fn create(destination: &Path) -> io::Result<(Self, File)> {
        for _ in 0..16 {
            let path = sibling_path(destination, "part");
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(file) => return Ok((Self { path, armed: true }, file)),
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(error) => return Err(error),
            }
        }
        Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "unable to reserve preset staging path",
        ))
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for StagedFile {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "still-preset-write-test-{}-{}",
            std::process::id(),
            FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        directory
    }

    #[test]
    fn writes_a_complete_file_and_removes_the_old_backup() {
        let directory = test_directory();
        let destination = directory.join("presets.json");
        fs::write(&destination, b"old presets").expect("write original");

        write_bytes_atomic(&destination, b"new presets").expect("replace presets");

        assert_eq!(
            fs::read(&destination).expect("read presets"),
            b"new presets"
        );
        assert_eq!(fs::read_dir(&directory).expect("list directory").count(), 1);
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn creates_a_new_file_without_leaving_staging_files() {
        let directory = test_directory();
        let destination = directory.join("presets.json");

        write_bytes_atomic(&destination, b"new presets").expect("create presets");

        assert_eq!(
            fs::read(&destination).expect("read presets"),
            b"new presets"
        );
        assert_eq!(fs::read_dir(&directory).expect("list directory").count(), 1);
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn failed_publication_restores_original_and_removes_staging() {
        let directory = test_directory();
        let destination = directory.join("presets.json");
        fs::write(&destination, b"old presets").expect("write original");
        let (mut staged, mut file) = StagedFile::create(&destination).expect("stage presets");
        file.write_all(b"new presets").expect("write staging");
        drop(file);
        let mut calls = 0;

        let result = publish_with_rollback(&mut staged, &destination, |from, to| {
            calls += 1;
            if calls == 2 {
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "publish failed",
                ))
            } else {
                rename_no_replace(from, to)
            }
        });

        assert!(result.is_err());
        drop(staged);
        assert_eq!(
            fs::read(&destination).expect("read original"),
            b"old presets"
        );
        assert_eq!(fs::read_dir(&directory).expect("list directory").count(), 1);
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn failed_rollback_keeps_a_named_original_backup() {
        let directory = test_directory();
        let destination = directory.join("presets.json");
        fs::write(&destination, b"old presets").expect("write original");
        let (mut staged, file) = StagedFile::create(&destination).expect("stage presets");
        drop(file);
        let mut calls = 0;

        let result = publish_with_rollback(&mut staged, &destination, |from, to| {
            calls += 1;
            if calls == 1 {
                rename_no_replace(from, to)
            } else {
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "rename failed",
                ))
            }
        });

        let Err(AppError::PresetRecoveryRequired { backup_path, .. }) = result else {
            panic!("expected preset recovery path");
        };
        drop(staged);
        assert!(!destination.exists());
        assert_eq!(fs::read(backup_path).expect("read backup"), b"old presets");
        assert_eq!(fs::read_dir(&directory).expect("list directory").count(), 1);
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn preference_rollback_failure_identifies_the_preference_backup() {
        let directory = test_directory();
        let destination = directory.join("preferences.json");
        fs::write(&destination, b"old preferences").expect("write original");
        let (mut staged, file) = StagedFile::create(&destination).expect("stage preferences");
        drop(file);
        let mut calls = 0;

        let result = publish_with_rollback_for(
            &mut staged,
            &destination,
            |from, to| {
                calls += 1;
                if calls == 1 {
                    rename_no_replace(from, to)
                } else {
                    Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "rename failed",
                    ))
                }
            },
            FilePurpose::Preference,
        );

        let error = result.expect_err("preference migration must need recovery");
        assert_eq!(error.code(), "preference_recovery_required");
        let AppError::PreferenceRecoveryRequired { backup_path, .. } = error else {
            panic!("expected preference recovery path");
        };
        assert_eq!(
            fs::read(&backup_path).expect("read backup"),
            b"old preferences"
        );
        drop(staged);
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
