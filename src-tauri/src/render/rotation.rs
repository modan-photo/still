use image::{imageops, RgbaImage};

use super::spec::RotationSpec;

/// Reorders pixels without resampling: rotate first, then flip in display space.
/// RenderSpec validation guarantees an angle of 0, 90, 180 or 270.
pub fn apply_rotation(src: &RgbaImage, spec: &RotationSpec) -> RgbaImage {
    let mut result = match spec.angle {
        0 => src.clone(),
        90 => imageops::rotate90(src),
        180 => imageops::rotate180(src),
        270 => imageops::rotate270(src),
        _ => unreachable!("rotation angle must be validated before rendering"),
    };
    if spec.flip_h {
        imageops::flip_horizontal_in_place(&mut result);
    }
    if spec.flip_v {
        imageops::flip_vertical_in_place(&mut result);
    }
    result
}

#[cfg(test)]
mod tests {
    use image::Rgba;

    use super::*;

    fn source() -> RgbaImage {
        RgbaImage::from_fn(3, 2, |x, y| Rgba([x as u8, y as u8, 42, (x + y * 3) as u8]))
    }

    #[test]
    fn default_rotation_preserves_all_pixels_and_the_source() {
        let src = source();
        let mut result = apply_rotation(&src, &RotationSpec::default());
        assert_eq!(result, src);
        result.put_pixel(0, 0, Rgba([255; 4]));
        assert_ne!(result, src);
        assert_eq!(src, source());
    }

    #[test]
    fn all_angles_and_flips_preserve_exact_pixel_coordinates() {
        let src = source();
        for angle in [0, 90, 180, 270] {
            for flip_h in [false, true] {
                for flip_v in [false, true] {
                    let spec = RotationSpec {
                        angle,
                        flip_h,
                        flip_v,
                    };
                    let result = apply_rotation(&src, &spec);
                    let (width, height) = if angle == 90 || angle == 270 {
                        (src.height(), src.width())
                    } else {
                        src.dimensions()
                    };
                    assert_eq!(result.dimensions(), (width, height));
                    for (x, y, pixel) in src.enumerate_pixels() {
                        let (mut target_x, mut target_y) = match angle {
                            0 => (x, y),
                            90 => (src.height() - 1 - y, x),
                            180 => (src.width() - 1 - x, src.height() - 1 - y),
                            270 => (y, src.width() - 1 - x),
                            _ => unreachable!(),
                        };
                        if flip_h {
                            target_x = width - 1 - target_x;
                        }
                        if flip_v {
                            target_y = height - 1 - target_y;
                        }
                        assert_eq!(result.get_pixel(target_x, target_y), pixel, "{spec:?}");
                    }
                }
            }
        }
        assert_eq!(src, source());
    }

    #[test]
    fn four_clockwise_turns_restore_the_source_without_quality_loss() {
        let src = source();
        let spec = RotationSpec {
            angle: 90,
            ..RotationSpec::default()
        };
        let mut result = src.clone();
        for _ in 0..4 {
            result = apply_rotation(&result, &spec);
        }
        assert_eq!(result, src);
    }
}
