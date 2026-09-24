use std::{
    borrow::Cow,
    fs::{self, File},
    io::{BufWriter, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use image::{
    codecs::{jpeg::JpegEncoder, png::PngEncoder, webp::WebPEncoder},
    DynamicImage, ExtendedColorType, ImageEncoder, RgbImage, RgbaImage,
};
use tokio_util::sync::CancellationToken;

use crate::{
    error::AppError,
    render::spec::{OutputFormat, OutputSpec},
};

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// Encodes to a sibling temporary file and renames only after a complete write.
/// Existing destinations are rejected so a failed export can never destroy them.
pub fn save_image_atomic(
    image: &DynamicImage,
    destination: &Path,
    output: &OutputSpec,
    cancellation: &CancellationToken,
) -> Result<(), AppError> {
    ensure_not_cancelled(cancellation)?;
    if destination.exists() {
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
    let mut writer = BufWriter::new(CancellableWriter {
        file,
        token: cancellation.clone(),
    });

    match output.format {
        OutputFormat::Jpeg => encode_jpeg(image, &mut writer, output.quality)?,
        OutputFormat::Png => encode_png(image, &mut writer)?,
        OutputFormat::Webp => encode_webp(image, &mut writer)?,
    }

    writer.flush()?;
    let file = writer.into_inner().map_err(|error| error.into_error())?;
    file.file.sync_all()?;
    drop(file);
    ensure_not_cancelled(cancellation)?;

    // A hard link publishes the complete file without overwriting a destination
    // created concurrently. Both names are on the same filesystem.
    fs::hard_link(temporary.path(), destination)?;
    let _ = fs::remove_file(temporary.path());
    temporary.disarm();
    Ok(())
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

fn encode_webp(image: &DynamicImage, writer: &mut impl Write) -> Result<(), AppError> {
    let pixels: Cow<'_, RgbaImage> = match image.as_rgba8() {
        Some(pixels) => Cow::Borrowed(pixels),
        None => Cow::Owned(image.to_rgba8()),
    };
    WebPEncoder::new_lossless(writer).write_image(
        pixels.as_raw(),
        pixels.width(),
        pixels.height(),
        ExtendedColorType::Rgba8,
    )?;
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
    let mut input = File::open(source)?;
    let mut temporary = TemporaryOutput::new(destination);
    let mut output = File::options()
        .write(true)
        .create_new(true)
        .open(temporary.path())?;
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
    fs::hard_link(temporary.path(), destination)?;
    let _ = fs::remove_file(temporary.path());
    temporary.disarm();
    Ok(())
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
        Self { path, armed: true }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(&mut self) {
        self.armed = false;
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
            let temporary = super::TemporaryOutput::new(&destination);
            let file = fs::File::options()
                .write(true)
                .create_new(true)
                .open(temporary.path())
                .unwrap();
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
}
