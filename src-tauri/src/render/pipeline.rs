use std::path::Path;

use image::DynamicImage;

use crate::{
    error::AppError,
    render::{border::apply_border, spec::RenderSpec},
};

/// Decodes the source image and establishes the shared rendering entry point.
///
pub fn apply_render_spec(path: &Path, spec: &RenderSpec) -> Result<DynamicImage, AppError> {
    spec.validate().map_err(AppError::InvalidInput)?;
    let mut image = crate::image_io::load::decode_image(path)?;
    if let Some(border) = &spec.border {
        image = DynamicImage::ImageRgba8(apply_border(&image.to_rgba8(), border));
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
            BorderConfig, BorderStyle, BorderUnit, OutputFormat, OutputSpec, RenderSpec,
            SourceSpec, RENDER_SPEC_VERSION,
        },
    };

    use super::apply_render_spec;

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
