use image::RgbaImage;

use super::spec::CropSpec;

/// Crops display-oriented source pixels without resampling.
pub fn apply_crop(src: &RgbaImage, spec: &CropSpec) -> RgbaImage {
    if !spec.enabled || src.width() == 0 || src.height() == 0 {
        return src.clone();
    }

    let (x, width) = pixel_bounds(spec.rect.x, spec.rect.width, src.width());
    let (y, height) = pixel_bounds(spec.rect.y, spec.rect.height, src.height());
    image::imageops::crop_imm(src, x, y, width, height).to_image()
}

fn pixel_bounds(start: f64, length: f64, extent: u32) -> (u32, u32) {
    let start = if start.is_finite() {
        start.clamp(0.0, 1.0)
    } else {
        0.0
    };
    let length = if length.is_finite() {
        length.clamp(0.0, 1.0 - start)
    } else {
        0.0
    };
    // Round origin and size independently, then guard against pixel overflow.
    let origin = ((start * f64::from(extent)).round() as u32).min(extent - 1);
    let size = ((length * f64::from(extent)).round() as u32)
        .max(1)
        .min(extent - origin);
    (origin, size)
}

#[cfg(test)]
mod tests {
    use image::Rgba;

    use super::*;
    use crate::render::spec::{CropAspect, CropRect};

    fn source() -> RgbaImage {
        RgbaImage::from_fn(10, 8, |x, y| Rgba([x as u8, y as u8, 42, 255]))
    }

    fn crop(rect: CropRect) -> CropSpec {
        CropSpec {
            aspect: CropAspect::Free,
            rect,
            enabled: true,
        }
    }

    #[test]
    fn disabled_crop_preserves_every_pixel() {
        let src = source();
        assert_eq!(apply_crop(&src, &CropSpec::default()), src);
    }

    #[test]
    fn rounds_origin_and_size_without_resampling() {
        let src = source();
        let result = apply_crop(
            &src,
            &crop(CropRect {
                x: 0.15,
                y: 0.1875,
                width: 0.35,
                height: 0.4375,
            }),
        );
        assert_eq!(result.dimensions(), (4, 4));
        for (x, y, pixel) in result.enumerate_pixels() {
            assert_eq!(pixel, src.get_pixel(x + 2, y + 2));
        }
    }

    #[test]
    fn clamps_overflow_and_preserves_at_least_one_pixel() {
        let src = source();
        let result = apply_crop(
            &src,
            &crop(CropRect {
                x: 0.8,
                y: -0.5,
                width: 0.9,
                height: 2.0,
            }),
        );
        assert_eq!(result.dimensions(), (2, 8));
        assert_eq!(result.get_pixel(0, 0), src.get_pixel(8, 0));

        let result = apply_crop(
            &src,
            &crop(CropRect {
                x: 1.5,
                y: 1.0,
                width: -1.0,
                height: 0.0,
            }),
        );
        assert_eq!(result.dimensions(), (1, 1));
        assert_eq!(result.get_pixel(0, 0), src.get_pixel(9, 7));
    }

    #[test]
    fn non_finite_values_and_empty_sources_do_not_panic() {
        let spec = crop(CropRect {
            x: f64::NAN,
            y: f64::INFINITY,
            width: f64::NAN,
            height: f64::NEG_INFINITY,
        });
        assert_eq!(apply_crop(&source(), &spec).dimensions(), (1, 1));
        assert_eq!(
            apply_crop(&RgbaImage::new(0, 0), &spec).dimensions(),
            (0, 0)
        );
    }
}
