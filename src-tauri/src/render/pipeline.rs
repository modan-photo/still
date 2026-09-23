use std::path::Path;

use image::DynamicImage;

use crate::{error::AppError, render::spec::RenderSpec};

/// Decodes the source image and establishes the shared rendering entry point.
///
/// Stage 0 intentionally applies no border, watermark, or adjustment business
/// logic. Future operations must be driven exclusively by `RenderSpec`.
pub fn apply_render_spec(path: &Path, spec: &RenderSpec) -> Result<DynamicImage, AppError> {
    spec.validate().map_err(AppError::InvalidInput)?;

    crate::image_io::load::decode_image(path)
}
