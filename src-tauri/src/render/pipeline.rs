use std::path::Path;

use image::{DynamicImage, ImageReader};

use crate::{error::AppError, render::spec::RenderSpec};

/// Decodes the source image and establishes the shared rendering entry point.
///
/// Stage 0 intentionally applies no border, watermark, or adjustment business
/// logic. Future operations must be driven exclusively by `RenderSpec`.
pub fn apply_render_spec(path: &Path, spec: &RenderSpec) -> Result<DynamicImage, AppError> {
    spec.validate().map_err(AppError::InvalidInput)?;

    let decoder = ImageReader::open(path)?
        .with_guessed_format()?
        .into_decoder()?;
    let image = DynamicImage::from_decoder(decoder)?;

    Ok(image)
}
