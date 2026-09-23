use std::{
    borrow::Cow,
    fs::{self, File},
    io::{BufWriter, Write},
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
    let file = File::create(temporary.path())?;
    let mut writer = BufWriter::new(file);

    match output.format {
        OutputFormat::Jpeg => encode_jpeg(image, &mut writer, output.quality)?,
        OutputFormat::Png => encode_png(image, &mut writer)?,
        OutputFormat::Webp => encode_webp(image, &mut writer)?,
    }

    writer.flush()?;
    let file = writer.into_inner().map_err(|error| error.into_error())?;
    file.sync_all()?;
    ensure_not_cancelled(cancellation)?;

    fs::rename(temporary.path(), destination)?;
    temporary.disarm();
    Ok(())
}

fn encode_jpeg(
    image: &DynamicImage,
    writer: &mut BufWriter<File>,
    quality: u8,
) -> Result<(), AppError> {
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

fn encode_png(image: &DynamicImage, writer: &mut BufWriter<File>) -> Result<(), AppError> {
    PngEncoder::new(writer).write_image(
        image.as_bytes(),
        image.width(),
        image.height(),
        image.color().into(),
    )?;
    Ok(())
}

fn encode_webp(image: &DynamicImage, writer: &mut BufWriter<File>) -> Result<(), AppError> {
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
