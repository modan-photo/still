use std::{fs, path::PathBuf};

use ab_glyph::{Font, FontArc, PxScale, ScaleFont};
use image::{
    imageops::{self, FilterType},
    Rgba, RgbaImage,
};
use imageproc::{
    drawing::draw_text_mut,
    geometric_transformations::{rotate_about_center, Interpolation},
};

use crate::{
    error::AppError,
    render::spec::{Anchor, FontSizeUnit, FontSpec, WatermarkSpec, WatermarkType},
};

const FALLBACK_FONT_PATHS: &[&str] = if cfg!(target_os = "windows") {
    &[
        r"C:\Windows\Fonts\NotoSansSC-VF.ttf",
        r"C:\Windows\Fonts\seguiemj.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
} else if cfg!(target_os = "macos") {
    &[
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Apple Color Emoji.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
} else {
    &[
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
};

pub fn apply_watermark(
    base: &mut RgbaImage,
    spec: &WatermarkSpec,
    source_long_edge: u32,
) -> Result<(), AppError> {
    let mut mark = match spec.kind {
        WatermarkType::Text => render_text(spec, source_long_edge)?,
        WatermarkType::Image => render_image(spec)?,
    };
    if mark.width() == 0 || mark.height() == 0 {
        return Ok(());
    }

    if spec.rotation.abs() > f32::EPSILON {
        mark = rotate_about_center(
            &mark,
            spec.rotation.to_radians(),
            Interpolation::Bicubic,
            Rgba([0, 0, 0, 0]),
        );
    }
    apply_opacity(&mut mark, spec.opacity);

    if spec.tiled {
        tile(base, &mark, spec.tile_gap.max(0.0) as i64);
    } else {
        let (x, y) = placement(base, &mark, spec);
        imageops::overlay(base, &mark, x, y);
    }
    Ok(())
}

fn render_image(spec: &WatermarkSpec) -> Result<RgbaImage, AppError> {
    let path = spec
        .path
        .as_deref()
        .ok_or_else(|| AppError::InvalidInput("image watermark path is missing".into()))?;
    let source = image::open(path)
        .map_err(|error| AppError::InvalidInput(format!("cannot open watermark image: {error}")))?
        .to_rgba8();
    let width = ((source.width() as f32 * spec.scale).round() as u32).max(1);
    let height = ((source.height() as f32 * spec.scale).round() as u32).max(1);
    Ok(imageops::resize(
        &source,
        width,
        height,
        FilterType::Lanczos3,
    ))
}

fn render_text(spec: &WatermarkSpec, source_long_edge: u32) -> Result<RgbaImage, AppError> {
    let font_spec = spec
        .font
        .as_ref()
        .ok_or_else(|| AppError::InvalidInput("text watermark font is missing".into()))?;
    let fonts = load_fonts(font_spec)?;
    let size = match font_spec.size_unit {
        FontSizeUnit::Px => font_spec.size,
        FontSizeUnit::Percent => source_long_edge as f32 * font_spec.size / 100.0,
    } * spec.scale;
    let size = size.max(1.0);
    let scale = PxScale::from(size);
    let lines: Vec<&str> = spec.content.lines().collect();
    let line_height = (size * 1.28).ceil();
    let widths: Vec<f32> = lines
        .iter()
        .map(|line| measure_line(line, &fonts, scale))
        .collect();
    let shadow = &font_spec.shadow;
    let padding = (font_spec.stroke_width
        + shadow.blur * 2.0
        + shadow.offset_x.abs().max(shadow.offset_y.abs())
        + 4.0)
        .ceil() as u32;
    let width = widths.iter().copied().fold(0.0, f32::max).ceil() as u32 + padding * 2;
    let height = (line_height * lines.len().max(1) as f32).ceil() as u32 + padding * 2;
    let mut fill_layer = RgbaImage::new(width.max(1), height.max(1));
    let mut stroke_layer = RgbaImage::new(width.max(1), height.max(1));
    let fill = parse_color(&font_spec.color)?;
    let stroke = parse_color(&font_spec.stroke_color)?;

    for (line_index, line) in lines.iter().enumerate() {
        let y = padding as f32 + line_index as f32 * line_height;
        if font_spec.stroke_width > 0.0 {
            let radius = font_spec.stroke_width.ceil().min(24.0) as i32;
            for oy in -radius..=radius {
                for ox in -radius..=radius {
                    if ox * ox + oy * oy <= radius * radius {
                        draw_fallback_line(
                            &mut stroke_layer,
                            line,
                            padding as f32 + ox as f32,
                            y + oy as f32,
                            scale,
                            stroke,
                            &fonts,
                        );
                    }
                }
            }
        }
        draw_fallback_line(
            &mut fill_layer,
            line,
            padding as f32,
            y,
            scale,
            fill,
            &fonts,
        );
    }

    let mut result = RgbaImage::new(width.max(1), height.max(1));
    if shadow.blur > 0.0 || shadow.offset_x != 0.0 || shadow.offset_y != 0.0 {
        let mut shadow_layer = alpha_tint(&fill_layer, parse_color(&shadow.color)?);
        if shadow.blur > 0.0 {
            shadow_layer = imageops::blur(&shadow_layer, shadow.blur.min(64.0));
        }
        imageops::overlay(
            &mut result,
            &shadow_layer,
            shadow.offset_x.round() as i64,
            shadow.offset_y.round() as i64,
        );
    }
    imageops::overlay(&mut result, &stroke_layer, 0, 0);
    imageops::overlay(&mut result, &fill_layer, 0, 0);
    Ok(result)
}

fn load_fonts(spec: &FontSpec) -> Result<Vec<FontArc>, AppError> {
    let mut paths = Vec::<PathBuf>::new();
    if let Some(path) = &spec.path {
        let selected = PathBuf::from(path);
        paths.push(selected.clone());
        if let Some(directory) = selected.parent() {
            paths.push(directory.join("NotoSansSC-VF.ttf"));
            paths.push(directory.join("NotoEmoji-Variable.ttf"));
        }
    }
    paths.extend(FALLBACK_FONT_PATHS.iter().map(PathBuf::from));
    let fonts: Vec<FontArc> = paths
        .into_iter()
        .filter_map(|path| fs::read(path).ok())
        .filter_map(|bytes| FontArc::try_from_vec(bytes).ok())
        .collect();
    if fonts.is_empty() {
        Err(AppError::Unsupported(
            "no usable TrueType font was found".into(),
        ))
    } else {
        Ok(fonts)
    }
}

fn font_for(character: char, fonts: &[FontArc]) -> &FontArc {
    fonts
        .iter()
        .find(|font| font.glyph_id(character).0 != 0)
        .unwrap_or(&fonts[0])
}

fn measure_line(line: &str, fonts: &[FontArc], scale: PxScale) -> f32 {
    line.chars()
        .map(|character| {
            let font = font_for(character, fonts);
            font.as_scaled(scale).h_advance(font.glyph_id(character))
        })
        .sum()
}

fn draw_fallback_line(
    target: &mut RgbaImage,
    text: &str,
    mut x: f32,
    y: f32,
    scale: PxScale,
    color: Rgba<u8>,
    fonts: &[FontArc],
) {
    for character in text.chars() {
        let font = font_for(character, fonts);
        let advance = font.as_scaled(scale).h_advance(font.glyph_id(character));
        let glyph = character.to_string();
        draw_text_mut(
            target,
            color,
            x.round() as i32,
            y.round() as i32,
            scale,
            font,
            &glyph,
        );
        x += advance;
    }
}

fn alpha_tint(source: &RgbaImage, color: Rgba<u8>) -> RgbaImage {
    RgbaImage::from_fn(source.width(), source.height(), |x, y| {
        let alpha = source.get_pixel(x, y)[3] as u16 * color[3] as u16 / 255;
        Rgba([color[0], color[1], color[2], alpha as u8])
    })
}

fn apply_opacity(image: &mut RgbaImage, opacity: f32) {
    for pixel in image.pixels_mut() {
        pixel[3] = (pixel[3] as f32 * opacity).round().clamp(0.0, 255.0) as u8;
    }
}

fn placement(base: &RgbaImage, mark: &RgbaImage, spec: &WatermarkSpec) -> (i64, i64) {
    if let Some(point) = spec.free_position {
        return (
            (point.x * base.width() as f32 - mark.width() as f32 / 2.0 + spec.offset_x).round()
                as i64,
            (point.y * base.height() as f32 - mark.height() as f32 / 2.0 + spec.offset_y).round()
                as i64,
        );
    }
    let (horizontal, vertical) = match spec.position {
        Anchor::TopLeft => (0, 0),
        Anchor::TopCenter => (1, 0),
        Anchor::TopRight => (2, 0),
        Anchor::CenterLeft => (0, 1),
        Anchor::Center => (1, 1),
        Anchor::CenterRight => (2, 1),
        Anchor::BottomLeft => (0, 2),
        Anchor::BottomCenter => (1, 2),
        Anchor::BottomRight => (2, 2),
    };
    let x = match horizontal {
        0 => spec.offset_x,
        1 => (base.width() as f32 - mark.width() as f32) / 2.0 + spec.offset_x,
        _ => base.width() as f32 - mark.width() as f32 - spec.offset_x,
    };
    let y = match vertical {
        0 => spec.offset_y,
        1 => (base.height() as f32 - mark.height() as f32) / 2.0 + spec.offset_y,
        _ => base.height() as f32 - mark.height() as f32 - spec.offset_y,
    };
    (x.round() as i64, y.round() as i64)
}

fn tile(base: &mut RgbaImage, mark: &RgbaImage, gap: i64) {
    let step_x = mark.width() as i64 + gap.max(1);
    let step_y = mark.height() as i64 + gap.max(1);
    let mut row = 0_i64;
    let mut y = -(mark.height() as i64);
    while y < base.height() as i64 {
        let mut x = -(mark.width() as i64) - if row % 2 == 0 { 0 } else { step_x / 2 };
        while x < base.width() as i64 {
            imageops::overlay(base, mark, x, y);
            x += step_x;
        }
        row += 1;
        y += step_y;
    }
}

fn parse_color(value: &str) -> Result<Rgba<u8>, AppError> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 && hex.len() != 8 {
        return Err(AppError::InvalidInput(format!("invalid color {value}")));
    }
    let byte = |offset| {
        u8::from_str_radix(&hex[offset..offset + 2], 16)
            .map_err(|_| AppError::InvalidInput(format!("invalid color {value}")))
    };
    Ok(Rgba([
        byte(0)?,
        byte(2)?,
        byte(4)?,
        if hex.len() == 8 { byte(6)? } else { 255 },
    ]))
}

#[cfg(test)]
mod tests {
    use super::{apply_opacity, apply_watermark, font_for, load_fonts, tile};
    use crate::render::spec::{
        Anchor, FontSizeUnit, FontSpec, TextShadow, WatermarkSpec, WatermarkType,
    };
    use ab_glyph::Font;
    use image::{Rgba, RgbaImage};
    use std::{
        fs,
        time::{Duration, Instant, SystemTime},
    };

    #[test]
    fn opacity_multiplies_existing_alpha() {
        let mut image = RgbaImage::from_pixel(1, 1, Rgba([1, 2, 3, 200]));
        apply_opacity(&mut image, 0.5);
        assert_eq!(image.get_pixel(0, 0)[3], 100);
    }

    #[test]
    fn tiling_reaches_canvas_edges() {
        let mut base = RgbaImage::new(100, 100);
        let mark = RgbaImage::from_pixel(20, 10, Rgba([255, 255, 255, 255]));
        tile(&mut base, &mark, 5);
        assert!(base.pixels().filter(|pixel| pixel[3] > 0).count() > 1000);
    }

    #[test]
    fn bundled_fallbacks_cover_chinese_and_emoji() {
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/fonts");
        let spec = FontSpec {
            family: "Noto Sans SC".into(),
            path: Some(directory.join("NotoSansSC-VF.ttf").to_string_lossy().into()),
            size: 32.0,
            size_unit: FontSizeUnit::Px,
            weight: 400,
            italic: false,
            color: "#FFFFFF".into(),
            stroke_color: "#000000".into(),
            stroke_width: 0.0,
            shadow: TextShadow::default(),
        };
        let fonts = load_fonts(&spec).expect("load bundled fonts");
        assert_ne!(font_for('中', &fonts).glyph_id('中').0, 0);
        assert_ne!(font_for('😀', &fonts).glyph_id('😀').0, 0);
    }

    #[test]
    #[ignore]
    fn tiles_more_than_fifty_marks_on_4000px_image_under_two_seconds_in_release() {
        let directory = std::env::temp_dir().join(format!(
            "still-watermark-bench-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let mark_path = directory.join("mark.png");
        RgbaImage::from_pixel(140, 48, Rgba([255, 255, 255, 180]))
            .save(&mark_path)
            .unwrap();
        let spec = WatermarkSpec {
            kind: WatermarkType::Image,
            content: String::new(),
            path: Some(mark_path.to_string_lossy().into()),
            position: Anchor::Center,
            offset_x: 0.0,
            offset_y: 0.0,
            opacity: 0.72,
            rotation: -24.0,
            scale: 1.0,
            tiled: true,
            tile_gap: 120.0,
            free_position: None,
            font: None,
        };
        let mut base = RgbaImage::new(4_000, 3_000);
        let started = Instant::now();
        apply_watermark(&mut base, &spec, 4_000).unwrap();
        let elapsed = started.elapsed();
        let covered = base.pixels().filter(|pixel| pixel[3] > 0).count();
        assert!(
            covered > 50 * 140 * 48 / 2,
            "expected at least 50 visible marks"
        );
        assert!(
            elapsed < Duration::from_secs(2),
            "tiled render took {elapsed:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
