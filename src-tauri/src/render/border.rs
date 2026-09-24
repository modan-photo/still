use std::f32::consts::PI;

use image::{imageops, Rgba, RgbaImage};
use imageproc::{drawing::draw_filled_rect_mut, rect::Rect};
use rayon::prelude::*;

use super::spec::{BorderConfig, BorderStyle, BorderUnit};

#[derive(Clone, Copy)]
struct Insets {
    left: u32,
    top: u32,
    right: u32,
    bottom: u32,
}

/// Applies a RenderSpec border without resizing or resampling the source pixels.
pub fn apply_border(src: &RgbaImage, cfg: &BorderConfig) -> RgbaImage {
    match cfg.style {
        BorderStyle::Solid => render_frame(src, cfg, false),
        BorderStyle::Gradient => render_frame(src, cfg, true),
        BorderStyle::Polaroid => render_polaroid(src, cfg),
        BorderStyle::Film => render_film(src, cfg),
    }
}

fn resolve(value: f32, unit: BorderUnit, width: u32, height: u32) -> u32 {
    let pixels = match unit {
        BorderUnit::Px => value,
        BorderUnit::Percent => width.max(height) as f32 * value / 100.0,
    };
    pixels.max(0.0).round() as u32
}

fn render_frame(src: &RgbaImage, cfg: &BorderConfig, gradient: bool) -> RgbaImage {
    let width = resolve(cfg.width, cfg.unit, src.width(), src.height());
    let insets = Insets {
        left: width,
        top: width,
        right: width,
        bottom: width,
    };
    let (out_width, out_height) = output_size(src, insets);
    let mut output = if gradient {
        gradient_image(out_width, out_height, &cfg.colors, cfg.angle)
    } else {
        RgbaImage::from_pixel(out_width, out_height, parse_color(&cfg.color))
    };
    imageops::overlay(&mut output, src, width.into(), width.into());
    apply_rounded_alpha_mask(&mut output, cfg.radius.round() as u32);
    output
}

fn render_polaroid(src: &RgbaImage, cfg: &BorderConfig) -> RgbaImage {
    let width = resolve(cfg.width, cfg.unit, src.width(), src.height());
    let bottom = if cfg.caption {
        (width as f32 * 3.0).round() as u32
    } else {
        (width as f32 * 1.6).round() as u32
    };
    let insets = Insets {
        left: width,
        top: width,
        right: width,
        bottom,
    };
    let (out_width, out_height) = output_size(src, insets);
    let mut output = RgbaImage::from_pixel(out_width, out_height, Rgba([250, 249, 246, 255]));
    imageops::overlay(&mut output, src, width.into(), width.into());
    apply_rounded_alpha_mask(&mut output, cfg.radius.round() as u32);
    output
}

fn render_film(src: &RgbaImage, cfg: &BorderConfig) -> RgbaImage {
    let width = resolve(cfg.width, cfg.unit, src.width(), src.height());
    let insets = Insets {
        left: 0,
        top: width,
        right: 0,
        bottom: width,
    };
    let (out_width, out_height) = output_size(src, insets);
    let mut output = RgbaImage::from_pixel(out_width, out_height, Rgba([12, 12, 11, 255]));
    imageops::overlay(&mut output, src, 0, width.into());

    if width >= 4 && out_width >= 8 {
        let desired_step = (out_width as f32 * 0.065).clamp(18.0, 72.0);
        let count = ((out_width as f32 / desired_step).floor() as u32).max(2);
        let step = out_width as f32 / count as f32;
        let hole_width = (step * 0.46).max(3.0).round() as u32;
        let hole_height = (width as f32 * 0.34).max(2.0).round() as u32;
        let color = Rgba([236, 232, 218, 255]);
        for index in 0..count {
            let center = (index as f32 + 0.5) * step;
            let x = (center - hole_width as f32 / 2.0).round().max(0.0) as i32;
            let top_y = ((width - hole_height) / 2) as i32;
            let bottom_y = (width + src.height() + (width - hole_height) / 2) as i32;
            draw_filled_rect_mut(
                &mut output,
                Rect::at(x, top_y).of_size(hole_width, hole_height),
                color,
            );
            draw_filled_rect_mut(
                &mut output,
                Rect::at(x, bottom_y).of_size(hole_width, hole_height),
                color,
            );
        }
    }
    apply_rounded_alpha_mask(&mut output, cfg.radius.round() as u32);
    output
}

fn output_size(src: &RgbaImage, insets: Insets) -> (u32, u32) {
    (
        src.width()
            .saturating_add(insets.left)
            .saturating_add(insets.right),
        src.height()
            .saturating_add(insets.top)
            .saturating_add(insets.bottom),
    )
}

fn gradient_image(width: u32, height: u32, colors: &[String], angle: f32) -> RgbaImage {
    let parsed: Vec<Rgba<u8>> = colors.iter().map(|color| parse_color(color)).collect();
    let parsed = if parsed.len() >= 2 {
        parsed
    } else {
        vec![Rgba([255, 255, 255, 255]), Rgba([0, 0, 0, 255])]
    };
    let radians = angle * PI / 180.0;
    let dx = radians.cos();
    let dy = radians.sin();
    let span = (width as f32 * dx.abs() + height as f32 * dy.abs()).max(1.0);
    let center_x = width as f32 / 2.0;
    let center_y = height as f32 / 2.0;
    let start_x = center_x - dx * span / 2.0;
    let start_y = center_y - dy * span / 2.0;
    let mut image = RgbaImage::new(width, height);
    image
        .as_mut()
        .par_chunks_mut(4)
        .enumerate()
        .for_each(|(index, pixel)| {
            let x = (index as u32 % width) as f32 + 0.5;
            let y = (index as u32 / width) as f32 + 0.5;
            let t = (((x - start_x) * dx + (y - start_y) * dy) / span).clamp(0.0, 1.0);
            let scaled = t * (parsed.len() - 1) as f32;
            let low = scaled.floor() as usize;
            let high = (low + 1).min(parsed.len() - 1);
            let local = scaled - low as f32;
            for channel in 0..4 {
                pixel[channel] = (parsed[low][channel] as f32 * (1.0 - local)
                    + parsed[high][channel] as f32 * local)
                    .round() as u8;
            }
        });
    image
}

fn parse_color(value: &str) -> Rgba<u8> {
    let hex = value.trim().trim_start_matches('#');
    let byte = |start: usize| u8::from_str_radix(&hex[start..start + 2], 16).ok();
    match hex.len() {
        6 => match (byte(0), byte(2), byte(4)) {
            (Some(r), Some(g), Some(b)) => Rgba([r, g, b, 255]),
            _ => Rgba([0, 0, 0, 255]),
        },
        8 => match (byte(0), byte(2), byte(4), byte(6)) {
            (Some(r), Some(g), Some(b), Some(a)) => Rgba([r, g, b, a]),
            _ => Rgba([0, 0, 0, 255]),
        },
        _ => Rgba([0, 0, 0, 255]),
    }
}

/// Multiplies existing alpha by a 4x4 sub-pixel rounded-rectangle mask.
fn apply_rounded_alpha_mask(image: &mut RgbaImage, radius: u32) {
    if radius == 0 {
        return;
    }
    let width = image.width();
    let height = image.height();
    let radius = radius.min(width / 2).min(height / 2);
    for y in 0..radius {
        for x in 0..radius {
            for (px, py) in [
                (x, y),
                (width - 1 - x, y),
                (x, height - 1 - y),
                (width - 1 - x, height - 1 - y),
            ] {
                let coverage = rounded_coverage(px, py, width, height, radius);
                if coverage < 255 {
                    let alpha = image.get_pixel(px, py)[3];
                    image.get_pixel_mut(px, py)[3] = ((alpha as u16 * coverage as u16) / 255) as u8;
                }
            }
        }
    }
}

fn rounded_coverage(x: u32, y: u32, width: u32, height: u32, radius: u32) -> u8 {
    let radius = radius.min(width / 2).min(height / 2);
    if radius == 0 {
        return 255;
    }
    let in_corner = (x < radius || x >= width - radius) && (y < radius || y >= height - radius);
    if !in_corner {
        return 255;
    }
    let center_x = if x < radius {
        radius as f32
    } else {
        (width - radius) as f32
    };
    let center_y = if y < radius {
        radius as f32
    } else {
        (height - radius) as f32
    };
    let mut inside = 0u8;
    for sy in 0..4 {
        for sx in 0..4 {
            let sample_x = x as f32 + (sx as f32 + 0.5) / 4.0;
            let sample_y = y as f32 + (sy as f32 + 0.5) / 4.0;
            let dx = sample_x - center_x;
            let dy = sample_y - center_y;
            if dx * dx + dy * dy <= (radius as f32).powi(2) {
                inside += 1;
            }
        }
    }
    (inside as u16 * 255 / 16) as u8
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use image::{Rgba, RgbaImage};

    use super::apply_border;
    use crate::render::spec::{BorderConfig, BorderStyle, BorderUnit};

    fn config(style: BorderStyle) -> BorderConfig {
        BorderConfig {
            style,
            width: 10.0,
            unit: BorderUnit::Px,
            color: "#FF000080".into(),
            radius: 8.0,
            colors: vec!["#FF0000".into(), "#0000FF".into()],
            angle: 0.0,
            caption: true,
        }
    }

    #[test]
    fn solid_expands_and_antialiases_outer_corners() {
        let source = RgbaImage::from_pixel(20, 10, Rgba([1, 2, 3, 255]));
        let result = apply_border(&source, &config(BorderStyle::Solid));
        assert_eq!(result.dimensions(), (40, 30));
        assert_eq!(result.get_pixel(10, 10), source.get_pixel(0, 0));
        assert_eq!(result.get_pixel(0, 0)[3], 0);
    }

    #[test]
    fn percent_uses_the_source_long_edge() {
        let source = RgbaImage::from_pixel(200, 100, Rgba([0, 0, 0, 255]));
        let mut cfg = config(BorderStyle::Solid);
        cfg.unit = BorderUnit::Percent;
        cfg.width = 5.0;
        assert_eq!(apply_border(&source, &cfg).dimensions(), (220, 120));
    }

    #[test]
    fn polaroid_and_film_have_style_specific_geometry() {
        let source = RgbaImage::from_pixel(100, 50, Rgba([0, 0, 0, 255]));
        assert_eq!(
            apply_border(&source, &config(BorderStyle::Polaroid)).dimensions(),
            (120, 90)
        );
        assert_eq!(
            apply_border(&source, &config(BorderStyle::Film)).dimensions(),
            (100, 70)
        );
    }

    /// Acceptance benchmark; ignored in routine debug test runs.
    #[test]
    #[ignore]
    fn renders_6000_by_4000_solid_border_under_three_seconds_in_release() {
        let source = RgbaImage::from_pixel(6_000, 4_000, Rgba([24, 48, 72, 255]));
        let mut cfg = config(BorderStyle::Solid);
        cfg.width = 100.0;
        cfg.radius = 100.0;
        let started = Instant::now();
        let result = apply_border(&source, &cfg);
        let elapsed = started.elapsed();
        assert_eq!(result.dimensions(), (6_200, 4_200));
        assert!(
            elapsed < Duration::from_secs(3),
            "border render took {elapsed:?}"
        );
        eprintln!("6000x4000 border render: {elapsed:?}");
    }
}
