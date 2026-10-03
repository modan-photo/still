use std::{fs, path::PathBuf};

use ab_glyph::{point, Font, FontArc, FontVec, PxScale, ScaleFont, VariableFont};
use image::{
    imageops::{self, FilterType},
    Rgba, RgbaImage,
};

use crate::{
    error::AppError,
    image_io::load::decode_image,
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
        mark = rotate_expanded(&mark, spec.rotation);
    }
    apply_opacity(&mut mark, spec.opacity);

    if spec.tiled {
        tile(base, &mark, spec.tile_gap.max(0.0) as i64);
    } else {
        let (x, y) = placement(base, &mark, spec);
        overlay_rgba(base, &mark, x, y);
    }
    Ok(())
}

fn render_image(spec: &WatermarkSpec) -> Result<RgbaImage, AppError> {
    let path = spec
        .path
        .as_deref()
        .ok_or_else(|| AppError::InvalidInput("image watermark path is missing".into()))?;
    let source = decode_image(std::path::Path::new(path))?.to_rgba8();
    let width = ((source.width() as f32 * spec.scale).round() as u32).max(1);
    let height = ((source.height() as f32 * spec.scale).round() as u32).max(1);
    Ok(imageops::resize(
        &source,
        width,
        height,
        FilterType::Lanczos3,
    ))
}

/// Rotate around pixel centers into the complete bounding box, as Canvas does.
/// Arbitrary angles sample premultiplied RGBA to avoid dark transparent edges.
fn rotate_expanded(source: &RgbaImage, degrees: f32) -> RgbaImage {
    let angle = degrees.rem_euclid(360.0);
    match angle {
        0.0 => return source.clone(),
        90.0 => return imageops::rotate90(source),
        180.0 => return imageops::rotate180(source),
        270.0 => return imageops::rotate270(source),
        _ => {}
    }
    let radians = (angle as f64).to_radians();
    let (sin, cos) = radians.sin_cos();
    let width =
        (source.width() as f64 * cos.abs() + source.height() as f64 * sin.abs()).ceil() as u32;
    let height =
        (source.width() as f64 * sin.abs() + source.height() as f64 * cos.abs()).ceil() as u32;
    RgbaImage::from_fn(width, height, |x, y| {
        let dx = x as f64 + 0.5 - width as f64 / 2.0;
        let dy = y as f64 + 0.5 - height as f64 / 2.0;
        let sx = cos * dx + sin * dy + source.width() as f64 / 2.0 - 0.5;
        let sy = -sin * dx + cos * dy + source.height() as f64 / 2.0 - 0.5;
        let left = sx.floor() as i64;
        let top = sy.floor() as i64;
        let fx = sx - left as f64;
        let fy = sy - top as f64;
        let mut alpha = 0.0;
        let mut rgb = [0.0; 3];
        for (ox, oy, weight) in [
            (0, 0, (1.0 - fx) * (1.0 - fy)),
            (1, 0, fx * (1.0 - fy)),
            (0, 1, (1.0 - fx) * fy),
            (1, 1, fx * fy),
        ] {
            let px = left + ox;
            let py = top + oy;
            if px < 0 || py < 0 || px >= source.width() as i64 || py >= source.height() as i64 {
                continue;
            }
            let pixel = source.get_pixel(px as u32, py as u32);
            let coverage = weight * pixel[3] as f64;
            alpha += coverage;
            for c in 0..3 {
                rgb[c] += coverage * pixel[c] as f64;
            }
        }
        let opacity = alpha.round().clamp(0.0, 255.0) as u8;
        if opacity == 0 {
            return Rgba([0, 0, 0, 0]);
        }
        Rgba([
            (rgb[0] / alpha).round() as u8,
            (rgb[1] / alpha).round() as u8,
            (rgb[2] / alpha).round() as u8,
            opacity,
        ])
    })
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
    let lines: Vec<&str> = spec.content.split('\n').collect();
    let line_height = size * 1.28;
    let widths: Vec<f32> = lines
        .iter()
        .map(|line| measure_line(line, &fonts, size))
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
                            size,
                            stroke,
                            &fonts,
                        );
                    }
                }
            }
        }
        draw_fallback_line(&mut fill_layer, line, padding as f32, y, size, fill, &fonts);
    }

    let mut result = RgbaImage::new(width.max(1), height.max(1));
    if shadow.blur > 0.0 || shadow.offset_x != 0.0 || shadow.offset_y != 0.0 {
        let mut shadow_layer = alpha_tint(&fill_layer, parse_color(&shadow.color)?);
        if shadow.blur > 0.0 {
            shadow_layer = imageops::blur(&shadow_layer, shadow.blur.min(64.0));
        }
        overlay_rgba(
            &mut result,
            &shadow_layer,
            shadow.offset_x.round() as i64,
            shadow.offset_y.round() as i64,
        );
    }
    overlay_rgba(&mut result, &stroke_layer, 0, 0);
    overlay_rgba(&mut result, &fill_layer, 0, 0);
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
        .filter_map(|bytes| FontVec::try_from_vec(bytes).ok())
        .map(|mut font| {
            font.set_variation(b"wght", spec.weight as f32);
            FontArc::new(font)
        })
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

// Canvas font sizes are pixels per em; ab_glyph PxScale instead describes
// ascent minus descent. Convert separately for each fallback font.
fn em_scale(font: &FontArc, size: f32) -> PxScale {
    PxScale::from(
        size * font.height_unscaled() / font.units_per_em().unwrap_or(font.height_unscaled()),
    )
}

fn measure_line(line: &str, fonts: &[FontArc], size: f32) -> f32 {
    line.chars()
        .map(|character| {
            let font = font_for(character, fonts);
            font.as_scaled(em_scale(font, size))
                .h_advance(font.glyph_id(character))
        })
        .sum()
}

fn draw_fallback_line(
    target: &mut RgbaImage,
    text: &str,
    mut x: f32,
    y: f32,
    size: f32,
    color: Rgba<u8>,
    fonts: &[FontArc],
) {
    for character in text.chars() {
        let font = font_for(character, fonts);
        let scale = em_scale(font, size);
        let advance = font.as_scaled(scale).h_advance(font.glyph_id(character));
        // Both renderers use an alphabetic baseline one em below each line top.
        // Keep subpixel positions and straight RGB; only coverage changes alpha.
        let glyph = font
            .glyph_id(character)
            .with_scale_and_position(scale, point(x, y + size));
        if let Some(outline) = font.outline_glyph(glyph) {
            let bounds = outline.px_bounds();
            outline.draw(|gx, gy, coverage| {
                let px = bounds.min.x as i32 + gx as i32;
                let py = bounds.min.y as i32 + gy as i32;
                if px >= 0 && py >= 0 && px < target.width() as i32 && py < target.height() as i32 {
                    let mut covered = color;
                    covered[3] = (color[3] as f32 * coverage).round().clamp(0.0, 255.0) as u8;
                    blend_rgba(target.get_pixel_mut(px as u32, py as u32), covered);
                }
            });
        }
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

// Integer source-over avoids floating-point truncation turning opaque pixels
// into alpha 254, or darkening straight RGB when painting onto transparent layers.
fn blend_rgba(background: &mut Rgba<u8>, foreground: Rgba<u8>) {
    let source_alpha = foreground[3] as u32;
    if source_alpha == 0 {
        return;
    }
    let remaining = 255 - source_alpha;
    let background_alpha = background[3] as u32;
    let alpha = source_alpha * 255 + background_alpha * remaining;
    for channel in 0..3 {
        let numerator = foreground[channel] as u32 * source_alpha * 255
            + background[channel] as u32 * background_alpha * remaining;
        background[channel] = ((numerator + alpha / 2) / alpha) as u8;
    }
    background[3] = ((alpha + 127) / 255) as u8;
}

fn overlay_rgba(base: &mut RgbaImage, mark: &RgbaImage, x: i64, y: i64) {
    let left = x.clamp(0, base.width() as i64) as u32;
    let top = y.clamp(0, base.height() as i64) as u32;
    let right = (x + mark.width() as i64).clamp(0, base.width() as i64) as u32;
    let bottom = (y + mark.height() as i64).clamp(0, base.height() as i64) as u32;
    for by in top..bottom {
        for bx in left..right {
            let foreground = *mark.get_pixel((bx as i64 - x) as u32, (by as i64 - y) as u32);
            blend_rgba(base.get_pixel_mut(bx, by), foreground);
        }
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
            overlay_rgba(base, mark, x, y);
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

    fn text_fixture(content: &str, weight: u16) -> WatermarkSpec {
        serde_json::from_value(serde_json::json!({
            "type": "text", "content": content, "position": "center",
            "offsetX": 0, "offsetY": 0, "opacity": 1, "rotation": 0,
            "scale": 1, "tiled": false, "tileGap": 20,
            "font": {"family": "Noto Sans SC", "path": std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("resources/fonts/NotoSansSC-VF.ttf").to_string_lossy(),
                "size": 32, "sizeUnit": "px", "weight": weight, "italic": false,
                "color": "#78C828", "strokeColor": "#000000", "strokeWidth": 0,
                "shadow": {"color": "#00000000", "blur": 0, "offsetX": 0, "offsetY": 0}}
        })).unwrap()
    }

    #[test]
    fn image_watermark_normalizes_exif_before_scaling_without_changing_source() {
        let directory = std::env::temp_dir().join(format!(
            "still-watermark-orientation-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let path = directory.join("mark.jpg");
        image::RgbImage::from_fn(80, 40, |x, y| image::Rgb([x as u8 * 3, y as u8 * 5, 80]))
            .save(&path)
            .unwrap();
        let jpeg = fs::read(&path).unwrap();
        let raw = image::open(&path).unwrap().to_rgba8();
        for orientation in [6u8, 8] {
            let mut tiff =
                b"II\x2a\0\x08\0\0\0\x01\0\x12\x01\x03\0\x01\0\0\0\x06\0\0\0\0\0\0\0".to_vec();
            tiff[18] = orientation;
            let mut bytes = jpeg[..2].to_vec();
            bytes.extend_from_slice(&[0xff, 0xe1]);
            bytes.extend_from_slice(&((2 + 6 + tiff.len()) as u16).to_be_bytes());
            bytes.extend_from_slice(b"Exif\0\0");
            bytes.extend_from_slice(&tiff);
            bytes.extend_from_slice(&jpeg[2..]);
            fs::write(&path, &bytes).unwrap();
            let mut spec = text_fixture("", 400);
            spec.kind = crate::render::spec::WatermarkType::Image;
            spec.path = Some(path.to_string_lossy().into_owned());
            let expected = if orientation == 6 {
                image::imageops::rotate90(&raw)
            } else {
                image::imageops::rotate270(&raw)
            };
            assert_eq!(super::render_image(&spec).unwrap(), expected);
            spec.scale = 0.5;
            assert_eq!(super::render_image(&spec).unwrap().dimensions(), (20, 40));
            assert_eq!(fs::read(&path).unwrap(), bytes);
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn quarter_turn_watermarks_keep_every_pixel_and_swap_dimensions() {
        let source = RgbaImage::from_fn(3, 2, |x, y| Rgba([(y * 3 + x + 1) as u8, 0, 0, 180]));
        let rotated = super::rotate_expanded(&source, 90.0);
        assert_eq!(rotated.dimensions(), (2, 3));
        assert_eq!(
            rotated.pixels().map(|p| p[0]).collect::<Vec<_>>(),
            vec![4, 1, 5, 2, 6, 3]
        );
        assert!(rotated.pixels().all(|p| p[3] == 180));
        assert_eq!(super::rotate_expanded(&rotated, -90.0), source);
        assert_eq!(super::rotate_expanded(&source, 360.0), source);
    }

    #[test]
    fn arbitrary_rotation_keeps_long_mark_and_straight_edge_colors() {
        let source = RgbaImage::from_pixel(120, 20, Rgba([120, 200, 40, 255]));
        let rotated = super::rotate_expanded(&source, 45.0);
        assert_eq!(rotated.dimensions(), (99, 99));
        let area = rotated.pixels().map(|p| p[3] as f64 / 255.0).sum::<f64>();
        assert!(
            (area - 2400.0).abs() < 24.0,
            "rotation lost image area: {area}"
        );
        let edges: Vec<_> = rotated
            .pixels()
            .filter(|p| p[3] > 0 && p[3] < 255)
            .collect();
        assert!(!edges.is_empty());
        assert!(edges
            .iter()
            .all(|p| p[0] == 120 && p[1] == 200 && p[2] == 40));
    }

    #[test]
    fn css_em_size_preserves_a_full_width_chinese_glyph() {
        let spec = text_fixture("中", 400);
        let fonts = load_fonts(spec.font.as_ref().unwrap()).unwrap();
        assert!((super::measure_line("中", &fonts, 32.0) - 32.0).abs() < 0.01);
        let rendered = super::render_text(&spec, 128).unwrap();
        assert_eq!(rendered.width(), 40); // 32px em plus two 4px pads.
    }

    #[test]
    fn glyph_antialiasing_preserves_straight_rgb_at_partial_alpha() {
        let rendered = super::render_text(&text_fixture("测试", 400), 128).unwrap();
        let edges: Vec<_> = rendered
            .pixels()
            .filter(|p| p[3] > 0 && p[3] < 255)
            .collect();
        assert!(!edges.is_empty());
        assert!(
            edges
                .iter()
                .all(|p| p[0] == 120 && p[1] == 200 && p[2] == 40),
            "edge channel ranges: {:?}",
            (0..3)
                .map(|c| (
                    edges.iter().map(|p| p[c]).min(),
                    edges.iter().map(|p| p[c]).max()
                ))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn trailing_empty_lines_and_fractional_line_height_match_canvas() {
        let rendered = super::render_text(&text_fixture("中\n", 400), 128).unwrap();
        assert_eq!(rendered.height(), (32.0_f32 * 1.28 * 2.0).ceil() as u32 + 8);
    }

    #[test]
    fn variable_font_weight_changes_the_rendered_glyphs() {
        let light = super::render_text(&text_fixture("Still 测试", 100), 128).unwrap();
        let bold = super::render_text(&text_fixture("Still 测试", 900), 128).unwrap();
        let alpha_sum = |image: &RgbaImage| image.pixels().map(|p| p[3] as u64).sum::<u64>();
        assert!(alpha_sum(&bold) > alpha_sum(&light));
    }

    #[test]
    fn clipped_source_over_preserves_opaque_background_and_rounds_color() {
        let mut base = RgbaImage::from_pixel(2, 1, Rgba([64, 64, 64, 255]));
        let mark = RgbaImage::from_pixel(2, 1, Rgba([240, 240, 240, 128]));
        super::overlay_rgba(&mut base, &mark, -1, 0);
        assert_eq!(*base.get_pixel(0, 0), Rgba([152, 152, 152, 255]));
        assert_eq!(*base.get_pixel(1, 0), Rgba([64, 64, 64, 255]));
        let original = base.clone();
        super::overlay_rgba(&mut base, &mark, 10, 10);
        assert_eq!(base, original);
    }

    #[test]
    fn text_watermark_never_makes_an_opaque_photo_translucent() {
        let mut base = RgbaImage::from_pixel(128, 96, Rgba([12, 23, 34, 255]));
        let mut spec = text_fixture("Still 测试", 400);
        spec.opacity = 0.72;
        apply_watermark(&mut base, &spec, 128).unwrap();
        assert!(base.pixels().any(|p| p[0] != 12));
        assert!(base.pixels().all(|p| p[3] == 255));
    }

    #[test]
    fn opacity_multiplies_existing_alpha() {
        let mut image = RgbaImage::from_pixel(1, 1, Rgba([1, 2, 3, 200]));
        apply_opacity(&mut image, 0.5);
        assert_eq!(image.get_pixel(0, 0)[3], 100);
    }

    #[test]
    fn negative_half_pixel_anchors_and_free_positions_round_away_from_zero() {
        let base = RgbaImage::new(1200, 800);
        let mark = RgbaImage::new(3000, 1500);
        let mut spec = text_fixture("", 400);
        spec.position = Anchor::TopLeft;
        spec.offset_x = -0.5;
        spec.offset_y = -2.5;
        assert_eq!(super::placement(&base, &mark, &spec), (-1, -3));
        spec.free_position = Some(crate::render::spec::NormalizedPoint { x: 0.0, y: 0.0 });
        spec.offset_x = 1499.5;
        spec.offset_y = 747.5;
        assert_eq!(super::placement(&base, &mark, &spec), (-1, -3));
    }

    #[test]
    fn odd_tile_steps_stagger_rows_on_integer_pixels() {
        let mut base = RgbaImage::new(12, 8);
        let mark = RgbaImage::from_pixel(4, 2, Rgba([255, 255, 255, 255]));
        tile(&mut base, &mark, 1);
        let opaque_x: Vec<_> = (0..12)
            .filter(|&x| base.get_pixel(x, 1)[3] == 255)
            .collect();
        // Row starts at -6, -1, 4, 9; each mark covers four pixels.
        assert_eq!(opaque_x, vec![0, 1, 2, 4, 5, 6, 7, 9, 10, 11]);
        assert!((0..12).all(|x| base.get_pixel(x, 0)[3] == 0));
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
