use image::RgbaImage;
use rayon::prelude::*;

use super::spec::AdjustmentsSpec;

/// Applies exposure, contrast, then saturation while preserving alpha.
pub fn apply_adjustments(image: &mut RgbaImage, spec: &AdjustmentsSpec) {
    let exposure = 2.0_f32.powf(spec.exposure);
    let contrast = 1.0 + spec.contrast;
    let saturation = 1.0 + spec.saturation;
    image.as_mut().par_chunks_mut(4).for_each(|pixel| {
        let mut red = pixel[0] as f32 * exposure;
        let mut green = pixel[1] as f32 * exposure;
        let mut blue = pixel[2] as f32 * exposure;
        red = (red - 127.5) * contrast + 127.5;
        green = (green - 127.5) * contrast + 127.5;
        blue = (blue - 127.5) * contrast + 127.5;
        let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        pixel[0] = clamp_byte(luminance + (red - luminance) * saturation);
        pixel[1] = clamp_byte(luminance + (green - luminance) * saturation);
        pixel[2] = clamp_byte(luminance + (blue - luminance) * saturation);
    });
}

fn clamp_byte(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use image::{Rgba, RgbaImage};

    use super::apply_adjustments;
    use crate::render::spec::AdjustmentsSpec;

    #[test]
    fn adjusts_every_pixel_in_a_ten_by_ten_image() {
        let mut image = RgbaImage::from_pixel(10, 10, Rgba([64, 64, 64, 200]));
        apply_adjustments(
            &mut image,
            &AdjustmentsSpec {
                exposure: 1.0,
                contrast: 0.0,
                saturation: 0.0,
            },
        );
        assert!(image
            .pixels()
            .all(|pixel| *pixel == Rgba([128, 128, 128, 200])));
    }
}
