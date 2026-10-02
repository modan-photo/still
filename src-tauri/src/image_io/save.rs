use std::{
    borrow::Cow,
    fs::{self, File},
    io::{BufWriter, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use image::{
    codecs::{jpeg::JpegEncoder, png::PngEncoder},
    DynamicImage, ExtendedColorType, ImageEncoder, RgbImage, RgbaImage,
};
use tokio_util::sync::CancellationToken;

use crate::{
    error::AppError,
    image_io::metadata::copy_metadata,
    render::spec::{OutputFormat, OutputSpec},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExistingDestination {
    Reject,
    Replace,
}

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Encodes to a sibling temporary file and renames only after a complete write.
/// Existing destinations are rejected so a failed export can never destroy them.
pub fn save_image_atomic(
    image: &DynamicImage,
    destination: &Path,
    output: &OutputSpec,
    cancellation: &CancellationToken,
) -> Result<(), AppError> {
    save_image_atomic_with_metadata(
        image,
        destination,
        output,
        cancellation,
        ExistingDestination::Reject,
        None,
        false,
        false,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn save_image_atomic_with_metadata(
    image: &DynamicImage,
    destination: &Path,
    output: &OutputSpec,
    cancellation: &CancellationToken,
    existing: ExistingDestination,
    metadata_source: Option<&Path>,
    preserve_exif: bool,
    preserve_icc: bool,
) -> Result<(), AppError> {
    ensure_not_cancelled(cancellation)?;
    if destination.exists() && existing == ExistingDestination::Reject {
        return Err(AppError::InvalidInput(format!(
            "destination already exists: {}",
            destination.display()
        )));
    }
    let parent = destination.parent().ok_or_else(|| {
        AppError::InvalidInput(format!(
            "destination has no parent: {}",
            destination.display()
        ))
    })?;
    if !parent.is_dir() {
        return Err(AppError::InvalidInput(format!(
            "destination directory does not exist: {}",
            parent.display()
        )));
    }

    let mut temporary = TemporaryOutput::new(destination);
    let file = File::options()
        .write(true)
        .create_new(true)
        .open(temporary.path())?;
    temporary.arm();
    let mut writer = BufWriter::new(CancellableWriter {
        file,
        token: cancellation.clone(),
    });

    let encoded = match output.format {
        OutputFormat::Jpeg => encode_jpeg(image, &mut writer, output.quality),
        OutputFormat::Png => encode_png(image, &mut writer),
        OutputFormat::Webp => encode_webp(image, &mut writer, output.quality),
    };
    // A cancellable writer can surface cancellation as a codec or I/O error.
    ensure_not_cancelled(cancellation)?;
    encoded?;

    writer.flush()?;
    let file = writer.into_inner().map_err(|error| error.into_error())?;
    file.file.sync_all()?;
    drop(file);
    ensure_not_cancelled(cancellation)?;

    if let Some(source) = metadata_source {
        copy_metadata(
            source,
            temporary.path(),
            output.format,
            image.width(),
            image.height(),
            preserve_exif,
            preserve_icc,
        )?;
        ensure_not_cancelled(cancellation)?;
    }

    match existing {
        ExistingDestination::Reject => {
            publish_new(temporary.path(), destination, cancellation)?;
        }
        ExistingDestination::Replace => {
            replace_with_rollback(temporary.path(), destination, |from, to| {
                fs::rename(from, to)
            })?;
        }
    }
    temporary.disarm();
    Ok(())
}

// The backup is deliberately not managed by a deletion-on-drop guard: it may be
// the only remaining copy if both publication and rollback fail.
fn replace_with_rollback(
    staged: &Path,
    destination: &Path,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), AppError> {
    if !destination.exists() {
        return publish(staged, destination).map_err(Into::into);
    }
    if !destination.is_file() {
        return Err(AppError::InvalidInput(
            "export destination is not a file".into(),
        ));
    }
    let mut backup = TemporaryOutput::new(destination);
    backup.path.set_extension(format!(
        "still-backup-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    backup.disarm();
    if backup.path().exists() {
        return Err(AppError::InvalidInput(
            "export backup already exists".into(),
        ));
    }
    rename_no_replace(destination, backup.path())?;
    match publish(staged, destination) {
        Ok(()) => {
            if let Err(error) = fs::remove_file(backup.path()) {
                eprintln!(
                    "unable to remove export backup {}: {error}",
                    backup.path().display()
                );
            }
            Ok(())
        }
        Err(commit_error) => {
            let rollback = rename_no_replace(backup.path(), destination);
            match rollback {
                Ok(()) => Err(commit_error.into()),
                Err(rollback_error) => Err(AppError::ExportRecoveryRequired {
                    backup_path: backup.path().to_string_lossy().into(),
                    commit_error: commit_error.to_string(),
                    rollback_error: rollback_error.to_string(),
                }),
            }
        }
    }
}

fn encode_jpeg(image: &DynamicImage, writer: &mut impl Write, quality: u8) -> Result<(), AppError> {
    let pixels: Cow<'_, RgbImage> = match image.as_rgb8() {
        Some(pixels) => Cow::Borrowed(pixels),
        None => Cow::Owned(image.to_rgb8()),
    };
    JpegEncoder::new_with_quality(writer, quality.clamp(1, 100)).encode(
        pixels.as_raw(),
        pixels.width(),
        pixels.height(),
        ExtendedColorType::Rgb8,
    )?;
    Ok(())
}

fn encode_png(image: &DynamicImage, writer: &mut impl Write) -> Result<(), AppError> {
    PngEncoder::new(writer).write_image(
        image.as_bytes(),
        image.width(),
        image.height(),
        image.color().into(),
    )?;
    Ok(())
}

fn encode_webp(image: &DynamicImage, writer: &mut impl Write, quality: u8) -> Result<(), AppError> {
    let pixels: Cow<'_, RgbaImage> = match image.as_rgba8() {
        Some(pixels) => Cow::Borrowed(pixels),
        None => Cow::Owned(image.to_rgba8()),
    };
    let encoded = webp::Encoder::from_rgba(pixels.as_raw(), pixels.width(), pixels.height())
        .encode(quality.clamp(1, 100) as f32);
    writer.write_all(&encoded)?;
    Ok(())
}

fn ensure_not_cancelled(cancellation: &CancellationToken) -> Result<(), AppError> {
    if cancellation.is_cancelled() {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

struct TemporaryOutput {
    path: PathBuf,
    armed: bool,
}

struct CancellableWriter {
    file: File,
    token: CancellationToken,
}
impl Write for CancellableWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if self.token.is_cancelled() {
            return Err(std::io::Error::other("task cancelled"));
        }
        self.file.write(bytes)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        self.file.flush()
    }
}

/// Byte-preserving export when no edits or encoding options were requested.
pub fn copy_image_atomic(
    source: &Path,
    destination: &Path,
    token: &CancellationToken,
) -> Result<(), AppError> {
    ensure_not_cancelled(token)?;
    let mut temporary = TemporaryOutput::new(destination);
    copy_to_staging(source, &mut temporary, token)?;
    publish_new(temporary.path(), destination, token)?;
    temporary.disarm();
    Ok(())
}

fn copy_to_staging(
    source: &Path,
    temporary: &mut TemporaryOutput,
    token: &CancellationToken,
) -> Result<(), AppError> {
    ensure_not_cancelled(token)?;
    let mut input = File::open(source)?;
    let mut output = File::options()
        .write(true)
        .create_new(true)
        .open(temporary.path())?;
    temporary.arm();
    let mut buffer = vec![0; 256 * 1024];
    loop {
        ensure_not_cancelled(token)?;
        let length = input.read(&mut buffer)?;
        if length == 0 {
            break;
        }
        output.write_all(&buffer[..length])?;
    }
    output.sync_all()?;
    drop(output);
    ensure_not_cancelled(token)?;
    Ok(())
}

fn publish_new(
    staged: &Path,
    destination: &Path,
    token: &CancellationToken,
) -> Result<(), AppError> {
    publish_new_with(
        staged,
        destination,
        token,
        |from, to| fs::hard_link(from, to),
        rename_no_replace,
    )
}

// Attempting the actual link probes the destination filesystem rather than
// trusting a drive-wide cache. Only capability failures use the copy fallback.
fn publish_new_with(
    staged: &Path,
    destination: &Path,
    token: &CancellationToken,
    link: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
    publish: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), AppError> {
    ensure_not_cancelled(token)?;
    match link(staged, destination) {
        Ok(()) => {
            let _ = fs::remove_file(staged);
            Ok(())
        }
        Err(error) if link_capability_error(&error) => {
            let mut copied = TemporaryOutput::new(destination);
            copy_to_staging(staged, &mut copied, token)?;
            ensure_not_cancelled(token)?;
            publish(copied.path(), destination)?;
            copied.disarm();
            let _ = fs::remove_file(staged);
            Ok(())
        }
        Err(error) => Err(error.into()),
    }
}

fn link_capability_error(error: &std::io::Error) -> bool {
    if matches!(
        error.kind(),
        std::io::ErrorKind::Unsupported | std::io::ErrorKind::CrossesDevices
    ) {
        return true;
    }
    #[cfg(windows)]
    return matches!(error.raw_os_error(), Some(1 | 17 | 50));
    #[cfg(any(target_os = "linux", target_os = "android"))]
    return matches!(error.raw_os_error(), Some(18 | 38 | 95));
    #[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
    false
}

#[cfg(windows)]
fn rename_no_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
    let wide = |path: &Path| -> std::io::Result<Vec<u16>> {
        let mut units: Vec<u16> = path.as_os_str().encode_wide().collect();
        if units.contains(&0) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "path contains a NUL",
            ));
        }
        units.push(0);
        Ok(units)
    };
    let source = wide(source)?;
    let destination = wide(destination)?;
    // SAFETY: both buffers are live NUL-terminated UTF-16 paths. Omitting
    // REPLACE_EXISTING and COPY_ALLOWED keeps publication on-volume/no-clobber.
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(any(target_os = "linux", target_os = "android"))]
fn rename_no_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    rustix::fs::renameat_with(
        rustix::fs::CWD,
        source,
        rustix::fs::CWD,
        destination,
        rustix::fs::RenameFlags::NOREPLACE,
    )
    .map_err(Into::into)
}

#[cfg(not(any(windows, target_os = "linux", target_os = "android")))]
fn rename_no_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    // Preserve the existing hard-link capability on other desktop platforms.
    // Link creation atomically rejects a target that appeared concurrently.
    fs::hard_link(source, destination)?;
    fs::remove_file(source)
}

impl TemporaryOutput {
    fn new(destination: &Path) -> Self {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let file_name = destination
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("image");
        let path = destination.with_file_name(format!(
            ".{file_name}.still-part-{}-{sequence}",
            std::process::id()
        ));
        Self { path, armed: false }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(&mut self) {
        self.armed = false;
    }

    fn arm(&mut self) {
        self.armed = true;
    }
}

impl Drop for TemporaryOutput {
    fn drop(&mut self) {
        if self.armed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use image::{DynamicImage, Rgba, RgbaImage};
    use tokio_util::sync::CancellationToken;

    use crate::render::spec::{OutputFormat, OutputSpec};

    use super::save_image_atomic;

    fn replacement_fixture() -> (std::path::PathBuf, std::path::PathBuf, std::path::PathBuf) {
        let directory = std::env::temp_dir().join(format!(
            "still-replace-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let staged = directory.join("staged.png");
        let target = directory.join("target.png");
        fs::write(&staged, b"new image").unwrap();
        fs::write(&target, b"old image").unwrap();
        (directory, staged, target)
    }

    #[test]
    fn unsupported_link_falls_back_to_byte_preserving_copy_and_atomic_publish() {
        let (directory, staged, target) = replacement_fixture();
        fs::remove_file(&target).unwrap();
        let bytes = vec![127; 600_000];
        fs::write(&staged, &bytes).unwrap();
        super::publish_new_with(
            &staged,
            &target,
            &CancellationToken::new(),
            |_, _| Err(std::io::ErrorKind::Unsupported.into()),
            super::rename_no_replace,
        )
        .unwrap();
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert!(!staged.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fallback_rejects_concurrent_target_and_cleans_its_copy() {
        let (directory, staged, target) = replacement_fixture();
        fs::remove_file(&target).unwrap();
        let result = super::publish_new_with(
            &staged,
            &target,
            &CancellationToken::new(),
            |_, _| Err(std::io::ErrorKind::Unsupported.into()),
            |from, to| {
                fs::write(to, b"concurrent image")?;
                super::rename_no_replace(from, to)
            },
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"concurrent image");
        assert_eq!(fs::read(&staged).unwrap(), b"new image");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fallback_publish_failure_cleans_copy_and_preserves_staged_data() {
        let (directory, staged, target) = replacement_fixture();
        fs::remove_file(&target).unwrap();
        let result = super::publish_new_with(
            &staged,
            &target,
            &CancellationToken::new(),
            |_, _| Err(std::io::ErrorKind::Unsupported.into()),
            |_, _| Err(std::io::ErrorKind::PermissionDenied.into()),
        );
        assert!(result.is_err());
        assert!(!target.exists());
        assert_eq!(fs::read(&staged).unwrap(), b"new image");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancellation_after_link_probe_prevents_fallback_publication() {
        let (directory, staged, target) = replacement_fixture();
        fs::remove_file(&target).unwrap();
        let token = CancellationToken::new();
        let result = super::publish_new_with(
            &staged,
            &target,
            &token,
            |_, _| {
                token.cancel();
                Err(std::io::ErrorKind::Unsupported.into())
            },
            |_, _| panic!("cancelled fallback must not publish"),
        );
        assert_eq!(result.unwrap_err().code(), "cancelled");
        assert!(!target.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn link_permission_failure_does_not_attempt_a_copy() {
        let (directory, staged, target) = replacement_fixture();
        fs::remove_file(&target).unwrap();
        assert!(super::publish_new_with(
            &staged,
            &target,
            &CancellationToken::new(),
            |_, _| Err(std::io::ErrorKind::PermissionDenied.into()),
            |_, _| panic!("permission failure must not trigger fallback"),
        )
        .is_err());
        assert!(!target.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn staging_collision_never_deletes_an_unowned_file() {
        let (directory, staged, target) = replacement_fixture();
        let mut temporary = super::TemporaryOutput::new(&target);
        let collision = temporary.path().to_path_buf();
        fs::write(&collision, b"another writer's data").unwrap();
        assert!(
            super::copy_to_staging(&staged, &mut temporary, &CancellationToken::new()).is_err()
        );
        drop(temporary);
        assert_eq!(fs::read(&collision).unwrap(), b"another writer's data");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn native_publication_handles_unicode_and_never_replaces() {
        let (directory, staged, _) = replacement_fixture();
        let target = directory.join("照片 🖼.png");
        super::rename_no_replace(&staged, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new image");
        fs::write(&staged, b"second image").unwrap();
        assert!(super::rename_no_replace(&staged, &target).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"new image");
        assert_eq!(fs::read(&staged).unwrap(), b"second image");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn replacement_commit_failure_restores_the_original() {
        let (directory, staged, target) = replacement_fixture();
        let result = super::replace_with_rollback(&staged, &target, |_, _| {
            Err(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "injected publish failure",
            ))
        });
        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"old image");
        assert_eq!(fs::read(&staged).unwrap(), b"new image");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn replacement_rollback_failure_keeps_backup_and_concurrent_file() {
        let (directory, staged, target) = replacement_fixture();
        let result = super::replace_with_rollback(&staged, &target, |_, destination| {
            fs::write(destination, b"concurrent image")?;
            Err(std::io::Error::other("injected publish failure"))
        });
        let result_error = result.unwrap_err();
        assert_eq!(result_error.code(), "export_recovery_required");
        let error = result_error.to_string();
        assert!(error.contains("Original retained at"));
        assert!(error.contains("rollback failed"));
        assert_eq!(fs::read(&target).unwrap(), b"concurrent image");
        let backup = fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| path != &staged && path != &target)
            .unwrap();
        assert_eq!(fs::read(backup).unwrap(), b"old image");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn replacement_success_removes_backup() {
        let (directory, staged, target) = replacement_fixture();
        super::replace_with_rollback(&staged, &target, |from, to| fs::rename(from, to)).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new image");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn metadata_failure_keeps_old_target_and_cleans_staging() {
        let (directory, staged, target) = replacement_fixture();
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([10, 20, 30, 255])));
        let result = super::save_image_atomic_with_metadata(
            &image,
            &target,
            &OutputSpec {
                format: OutputFormat::Png,
                quality: 100,
            },
            &CancellationToken::new(),
            super::ExistingDestination::Replace,
            Some(&directory.join("missing-source.png")),
            true,
            false,
        );
        assert!(result.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"old image");
        assert!(staged.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancelled_overwrite_preserves_existing_destination() {
        let (directory, staged, target) = replacement_fixture();
        let token = CancellationToken::new();
        token.cancel();
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([10, 20, 30, 255])));
        assert!(super::save_image_atomic_with_metadata(
            &image,
            &target,
            &OutputSpec {
                format: OutputFormat::Png,
                quality: 100
            },
            &token,
            super::ExistingDestination::Replace,
            None,
            false,
            false
        )
        .is_err());
        assert_eq!(fs::read(&target).unwrap(), b"old image");
        assert!(staged.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancellation_after_first_write_rejects_more_bytes_and_cleans_partial() {
        use std::io::Write;
        let directory = std::env::temp_dir().join(format!(
            "still-midwrite-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let destination = directory.join("image.png");
        let token = CancellationToken::new();
        {
            let mut temporary = super::TemporaryOutput::new(&destination);
            let file = fs::File::options()
                .write(true)
                .create_new(true)
                .open(temporary.path())
                .unwrap();
            temporary.arm();
            let mut writer = super::CancellableWriter {
                file,
                token: token.clone(),
            };
            writer.write_all(b"partial encoded data").unwrap();
            token.cancel();
            assert!(writer.write_all(b"must not be written").is_err());
            drop(writer);
        }
        assert!(!destination.exists());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn empty_spec_copy_preserves_bytes_and_never_overwrites() {
        let directory = std::env::temp_dir().join(format!(
            "still-copy-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let source = directory.join("source.jpg");
        let target = directory.join("target.jpg");
        let bytes = vec![123u8; 600_000];
        fs::write(&source, &bytes).unwrap();
        let token = CancellationToken::new();
        super::copy_image_atomic(&source, &target, &token).unwrap();
        assert_eq!(fs::read(&target).unwrap(), bytes);
        fs::write(&source, b"changed").unwrap();
        assert!(super::copy_image_atomic(&source, &target, &token).is_err());
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 2);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn cancelled_save_leaves_no_destination_or_partial_file() {
        let directory = std::env::temp_dir().join(format!(
            "still-save-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let destination = directory.join("cancelled.png");
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(4, 4, Rgba([10, 20, 30, 255])));
        let cancellation = CancellationToken::new();
        cancellation.cancel();

        let result = save_image_atomic(
            &image,
            &destination,
            &OutputSpec {
                format: OutputFormat::Png,
                quality: 100,
            },
            &cancellation,
        );

        assert!(result.is_err());
        assert!(!destination.exists());
        assert_eq!(fs::read_dir(&directory).expect("read directory").count(), 0);
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn saves_each_requested_output_format() {
        let directory = std::env::temp_dir().join(format!(
            "still-format-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let image = DynamicImage::ImageRgba8(RgbaImage::from_pixel(9, 5, Rgba([10, 20, 30, 180])));
        let cancellation = CancellationToken::new();

        for (format, extension) in [
            (OutputFormat::Jpeg, "jpg"),
            (OutputFormat::Png, "png"),
            (OutputFormat::Webp, "webp"),
        ] {
            let destination = directory.join(format!("output.{extension}"));
            save_image_atomic(
                &image,
                &destination,
                &OutputSpec {
                    format,
                    quality: 87,
                },
                &cancellation,
            )
            .expect("save image");
            assert_eq!(
                image::image_dimensions(destination).expect("read saved dimensions"),
                (9, 5)
            );
        }

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn webp_quality_changes_the_encoded_output() {
        let directory = std::env::temp_dir().join(format!(
            "still-webp-quality-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let image = DynamicImage::ImageRgba8(RgbaImage::from_fn(256, 256, |x, y| {
            Rgba([(x ^ y) as u8, x as u8, y as u8, 255])
        }));
        let token = CancellationToken::new();
        let low = directory.join("low.webp");
        let high = directory.join("high.webp");
        for (path, quality) in [(&low, 20), (&high, 95)] {
            save_image_atomic(
                &image,
                path,
                &OutputSpec {
                    format: OutputFormat::Webp,
                    quality,
                },
                &token,
            )
            .unwrap();
        }
        assert_ne!(fs::read(&low).unwrap(), fs::read(&high).unwrap());
        fs::remove_dir_all(directory).unwrap();
    }
}
