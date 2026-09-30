use std::path::Path;

use image::DynamicImage;

use crate::{
    error::AppError,
    render::{
        adjustments::apply_adjustments, border::apply_border, crop::apply_crop,
        rotation::apply_rotation, spec::RenderSpec, watermark::apply_watermark,
    },
};

/// Decodes the source image and establishes the shared rendering entry point.
///
pub fn apply_render_spec(path: &Path, spec: &RenderSpec) -> Result<DynamicImage, AppError> {
    spec.validate().map_err(AppError::InvalidInput)?;
    let mut image = crate::image_io::load::decode_image(path)?;
    // decode_image already normalizes EXIF orientation before these coordinates apply.
    // Skip identity transforms to retain the decoded buffer and its original format.
    if let Some(rotation) = spec
        .rotation
        .as_ref()
        .filter(|rotation| rotation.angle != 0 || rotation.flip_h || rotation.flip_v)
    {
        image = DynamicImage::ImageRgba8(apply_rotation(&image.to_rgba8(), rotation));
    }
    if let Some(crop) = spec.crop.as_ref().filter(|crop| crop.enabled) {
        let cropped = apply_crop(&image.to_rgba8(), crop);
        if cropped.width() < 16 || cropped.height() < 16 {
            return Err(AppError::InvalidInput(
                "Crop dimensions are too small".into(),
            ));
        }
        image = DynamicImage::ImageRgba8(cropped);
    }
    if let Some(adjustments) = &spec.adjustments {
        let mut rgba = image.to_rgba8();
        apply_adjustments(&mut rgba, adjustments);
        image = DynamicImage::ImageRgba8(rgba);
    }
    if let Some(border) = &spec.border {
        image = DynamicImage::ImageRgba8(apply_border(&image.to_rgba8(), border));
    }
    if let Some(watermark) = &spec.watermark {
        let mut rgba = image.to_rgba8();
        apply_watermark(
            &mut rgba,
            watermark,
            spec.source.width.max(spec.source.height),
        )?;
        image = DynamicImage::ImageRgba8(rgba);
    }
    Ok(image)
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{Duration, Instant, SystemTime},
    };

    use image::{Rgb, RgbImage};
    use tokio_util::sync::CancellationToken;

    use crate::{
        image_io::save::save_image_atomic,
        render::spec::{
            Anchor, BorderConfig, BorderStyle, BorderUnit, FontSizeUnit, FontSpec, OutputFormat,
            OutputSpec, RenderSpec, SourceSpec, TextShadow, WatermarkSpec, WatermarkType,
            RENDER_SPEC_VERSION,
        },
    };

    use super::apply_render_spec;

    #[test]
    fn crops_after_exif_orientation_and_before_border() {
        use crate::render::spec::{CropAspect, CropRect, CropSpec};

        let directory = std::env::temp_dir().join(format!(
            "still-crop-pipeline-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("oriented.jpg");
        RgbImage::from_fn(80, 40, |x, y| Rgb([x as u8, y as u8, 80]))
            .save(&source)
            .unwrap();
        // Add an EXIF APP1 segment carrying orientation 6 (90 degrees clockwise).
        let jpeg = fs::read(&source).unwrap();
        let tiff = b"II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0";
        let mut oriented = jpeg[..2].to_vec();
        oriented.extend_from_slice(&[0xff, 0xe1]);
        oriented.extend_from_slice(&((2 + 6 + tiff.len()) as u16).to_be_bytes());
        oriented.extend_from_slice(b"Exif\0\0");
        oriented.extend_from_slice(tiff);
        oriented.extend_from_slice(&jpeg[2..]);
        fs::write(&source, oriented).unwrap();

        let mut spec: RenderSpec = serde_json::from_value(serde_json::json!({
            "version": 1,
            "source": { "path": source.to_string_lossy(), "width": 40, "height": 80 },
            "border": {
                "style": "solid", "width": 2, "unit": "px", "color": "#FF0000",
                "radius": 0, "colors": ["#FF0000"], "angle": 0, "caption": false
            }
        }))
        .unwrap();
        spec.crop = Some(CropSpec {
            aspect: CropAspect::Square,
            rect: CropRect {
                x: 0.0,
                y: 0.5,
                width: 1.0,
                height: 0.5,
            },
            enabled: true,
        });
        let decoded = crate::image_io::load::decode_image(&source)
            .unwrap()
            .to_rgba8();
        assert_eq!(decoded.dimensions(), (40, 80));
        let result = apply_render_spec(&source, &spec).unwrap().to_rgba8();
        assert_eq!(result.dimensions(), (44, 44));
        assert_eq!(result.get_pixel(0, 0), &image::Rgba([255, 0, 0, 255]));
        for y in 0..40 {
            for x in 0..40 {
                assert_eq!(result.get_pixel(x + 2, y + 2), decoded.get_pixel(x, y + 40));
            }
        }

        // User rotation and flips apply after EXIF, before normalized crop and border.
        spec.rotation = Some(crate::render::spec::RotationSpec {
            angle: 90,
            flip_h: true,
            flip_v: false,
        });
        let transformed = apply_render_spec(&source, &spec).unwrap();
        let rotated_result = transformed.to_rgba8();
        assert_eq!(rotated_result.dimensions(), (84, 24));
        assert_eq!(
            rotated_result.get_pixel(0, 0),
            &image::Rgba([255, 0, 0, 255])
        );
        for y in 0..20 {
            for x in 0..80 {
                assert_eq!(
                    rotated_result.get_pixel(x + 2, y + 2),
                    decoded.get_pixel(y + 20, x)
                );
            }
        }
        let destination = directory.join("rotated.png");
        save_image_atomic(
            &transformed,
            &destination,
            &OutputSpec {
                format: OutputFormat::Png,
                quality: 100,
            },
            &CancellationToken::new(),
        )
        .unwrap();
        assert_eq!(
            image::open(&destination).unwrap().to_rgba8(),
            rotated_result
        );
        spec.crop.as_mut().unwrap().enabled = false;
        assert_eq!(
            apply_render_spec(&source, &spec)
                .unwrap()
                .to_rgba8()
                .dimensions(),
            (84, 44)
        );
        spec.crop.as_mut().unwrap().enabled = true;
        spec.rotation = Some(crate::render::spec::RotationSpec::default());
        assert_eq!(
            apply_render_spec(&source, &spec).unwrap().to_rgba8(),
            result
        );
        spec.rotation = None;

        // A border cannot conceal a crop smaller than the export minimum.
        spec.crop.as_mut().unwrap().rect.width = 0.1;
        assert!(matches!(
            apply_render_spec(&source, &spec),
            Err(crate::error::AppError::InvalidInput(message)) if message == "Crop dimensions are too small"
        ));
        spec.crop.as_mut().unwrap().enabled = false;
        assert_eq!(
            apply_render_spec(&source, &spec)
                .unwrap()
                .to_rgba8()
                .dimensions(),
            (44, 84)
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn renders_multiline_chinese_and_emoji_watermark_through_pipeline() {
        let directory = std::env::temp_dir().join(format!(
            "still-watermark-pipeline-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("source.png");
        image::RgbaImage::from_pixel(400, 300, image::Rgba([0, 0, 0, 255]))
            .save(&source)
            .unwrap();
        let font_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/NotoSansSC-VF.ttf");
        let spec = RenderSpec {
            version: RENDER_SPEC_VERSION,
            source: SourceSpec {
                path: source.to_string_lossy().into(),
                width: 400,
                height: 300,
            },
            rotation: None,
            crop: None,
            border: None,
            watermark: Some(WatermarkSpec {
                kind: WatermarkType::Text,
                content: "中文水印\nMade with 😀".into(),
                path: None,
                position: Anchor::Center,
                offset_x: 0.0,
                offset_y: 0.0,
                opacity: 1.0,
                rotation: -12.0,
                scale: 1.0,
                tiled: false,
                tile_gap: 96.0,
                free_position: None,
                font: Some(FontSpec {
                    family: "Noto Sans SC".into(),
                    path: Some(font_path.to_string_lossy().into()),
                    size: 8.0,
                    size_unit: FontSizeUnit::Percent,
                    weight: 500,
                    italic: false,
                    color: "#FFFFFFFF".into(),
                    stroke_color: "#000000".into(),
                    stroke_width: 1.0,
                    shadow: TextShadow::default(),
                }),
            }),
            adjustments: None,
            output: None,
        };
        let rendered = apply_render_spec(&source, &spec).unwrap().to_rgba8();
        assert!(rendered.pixels().any(|pixel| pixel[0] > 0));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn exports_a_copied_spec_from_a_ten_pixel_source() {
        let directory = std::env::temp_dir().join(format!(
            "still-batch-spec-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("target.png");
        image::RgbaImage::from_pixel(10, 10, image::Rgba([1, 2, 3, 255]))
            .save(&source)
            .unwrap();
        let spec = RenderSpec {
            version: RENDER_SPEC_VERSION,
            source: SourceSpec {
                path: source.to_string_lossy().into(),
                width: 10,
                height: 10,
            },
            rotation: None,
            crop: None,
            border: Some(BorderConfig {
                style: BorderStyle::Solid,
                width: 1.0,
                unit: BorderUnit::Px,
                color: "#FF0000".into(),
                radius: 0.0,
                colors: vec!["#FF0000".into(), "#FF0000".into()],
                angle: 0.0,
                caption: false,
            }),
            watermark: None,
            adjustments: None,
            output: Some(OutputSpec {
                format: OutputFormat::Png,
                quality: 100,
            }),
        };

        let rendered = apply_render_spec(&source, &spec).unwrap().to_rgba8();

        assert_eq!(rendered.dimensions(), (12, 12));
        assert_eq!(rendered.get_pixel(0, 0), &image::Rgba([255, 0, 0, 255]));
        assert_eq!(rendered.get_pixel(1, 1), &image::Rgba([1, 2, 3, 255]));
        fs::remove_dir_all(directory).unwrap();
    }

    /// Full decode/render/encode acceptance benchmark; ignored in debug runs.
    #[test]
    #[ignore]
    fn exports_6000_by_4000_border_under_three_seconds_in_release() {
        let directory = std::env::temp_dir().join(format!(
            "still-border-bench-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        fs::create_dir(&directory).expect("create benchmark directory");
        let source = directory.join("source.jpg");
        let destination = directory.join("result.jpg");
        RgbImage::from_pixel(6_000, 4_000, Rgb([32, 64, 96]))
            .save(&source)
            .expect("write fixture");
        let output = OutputSpec {
            format: OutputFormat::Jpeg,
            quality: 90,
        };
        let spec = RenderSpec {
            version: RENDER_SPEC_VERSION,
            source: SourceSpec {
                path: source.to_string_lossy().into_owned(),
                width: 6_000,
                height: 4_000,
            },
            rotation: None,
            crop: None,
            border: Some(BorderConfig {
                style: BorderStyle::Solid,
                width: 100.0,
                unit: BorderUnit::Px,
                color: "#FFFFFF".into(),
                radius: 100.0,
                colors: vec!["#FFFFFF".into(), "#000000".into()],
                angle: 0.0,
                caption: true,
            }),
            watermark: None,
            adjustments: None,
            output: Some(output.clone()),
        };
        let started = Instant::now();
        let rendered = apply_render_spec(&source, &spec).expect("render border");
        save_image_atomic(&rendered, &destination, &output, &CancellationToken::new())
            .expect("encode result");
        let elapsed = started.elapsed();
        assert_eq!((rendered.width(), rendered.height()), (6_200, 4_200));
        assert!(
            elapsed < Duration::from_secs(3),
            "full export took {elapsed:?}"
        );
        eprintln!("6000x4000 full border export: {elapsed:?}");
        fs::remove_dir_all(directory).expect("remove benchmark directory");
    }
}
