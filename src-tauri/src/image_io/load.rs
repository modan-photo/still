use std::{
    fs::File,
    io::BufReader,
    path::{Path, PathBuf},
};

use exif::{In, Reader as ExifReader, Tag};
use image::{metadata::Orientation, DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImageInfo {
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub orientation: u8,
}

/// Reads dimensions and format without allocating a full decoded pixel buffer.
pub fn inspect_image(path: &Path) -> Result<ImageInfo, AppError> {
    reject_optional_heic(path)?;

    let reader = ImageReader::open(super::source::resolve(path)?)?.with_guessed_format()?;
    let format = reader.format().ok_or_else(|| {
        AppError::Unsupported(format!(
            "could not determine image format for {}",
            path.display()
        ))
    })?;
    let decoder = reader.into_decoder()?;
    let (raw_width, raw_height) = decoder.dimensions();
    let orientation = read_exif_orientation(path)?;
    let (width, height) = oriented_dimensions(raw_width, raw_height, orientation);

    Ok(ImageInfo {
        path: path.to_path_buf(),
        width,
        height,
        format: format_name(format).into(),
        orientation,
    })
}

/// Decodes one still image. Animated formats intentionally resolve to frame zero.
pub fn decode_image(path: &Path) -> Result<DynamicImage, AppError> {
    reject_optional_heic(path)?;

    let orientation = read_exif_orientation(path)?;
    let decoder = ImageReader::open(super::source::resolve(path)?)?
        .with_guessed_format()?
        .into_decoder()?;
    let mut image = DynamicImage::from_decoder(decoder)?;

    if let Some(orientation) = Orientation::from_exif(orientation) {
        image.apply_orientation(orientation);
    }

    Ok(image)
}

pub fn read_exif_orientation(path: &Path) -> Result<u8, AppError> {
    let file = File::open(super::source::resolve(path)?)?;
    let mut reader = BufReader::new(file);
    let exif = match ExifReader::new().read_from_container(&mut reader) {
        Ok(exif) => exif,
        Err(exif::Error::NotFound(_) | exif::Error::InvalidFormat(_)) => return Ok(1),
        Err(error) => return Err(error.into()),
    };

    Ok(exif
        .get_field(Tag::Orientation, In::PRIMARY)
        .and_then(|field| field.value.get_uint(0))
        .and_then(|value| u8::try_from(value).ok())
        .filter(|value| (1..=8).contains(value))
        .unwrap_or(1))
}

fn oriented_dimensions(width: u32, height: u32, orientation: u8) -> (u32, u32) {
    if matches!(orientation, 5..=8) {
        (height, width)
    } else {
        (width, height)
    }
}

fn reject_optional_heic(path: &Path) -> Result<(), AppError> {
    let is_heic = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("heic") || extension.eq_ignore_ascii_case("heif")
        });

    if is_heic {
        return Err(AppError::Unsupported(
            "HEIC/HEIF decoding is not enabled in this build".into(),
        ));
    }
    Ok(())
}

fn format_name(format: ImageFormat) -> &'static str {
    match format {
        ImageFormat::Jpeg => "jpeg",
        ImageFormat::Png => "png",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp => "bmp",
        ImageFormat::Tiff => "tiff",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use image::{Rgba, RgbaImage};

    use super::inspect_image;

    #[test]
    fn inspects_png_without_decoding_the_full_image() {
        let directory = std::env::temp_dir().join(format!(
            "still-load-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let path = directory.join("sample.png");
        RgbaImage::from_pixel(7, 3, Rgba([20, 40, 60, 255]))
            .save(&path)
            .expect("write test image");

        let info = inspect_image(&path).expect("inspect image");
        assert_eq!((info.width, info.height), (7, 3));
        assert_eq!(info.format, "png");
        assert_eq!(info.orientation, 1);

        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
