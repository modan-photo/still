use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use fast_image_resize::{images::Image, PixelType, ResizeOptions, Resizer};
use image::{imageops, DynamicImage, Pixel, Rgba, RgbaImage};
use imageproc::geometric_transformations::{rotate_about_center, Interpolation};
use serde::Deserialize;
use tokio_util::sync::CancellationToken;

use crate::{
    error::AppError,
    image_io::save::save_image_atomic,
    render::spec::{OutputFormat, OutputSpec},
};

const MAX_PIXELS: u64 = 100_000_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CollageItem {
    pub path: String,
    #[serde(default)]
    pub transform: ItemTransform,
    #[serde(default)]
    pub cell: CollageCell,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemTransform {
    #[serde(default = "default_scale")]
    pub scale: f32,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
    #[serde(default)]
    pub rotation: f32,
    #[serde(default)]
    pub fit: FitMode,
}

impl Default for ItemTransform {
    fn default() -> Self {
        Self {
            scale: 1.0,
            offset_x: 0.0,
            offset_y: 0.0,
            rotation: 0.0,
            fit: FitMode::Cover,
        }
    }
}
fn default_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FitMode {
    Contain,
    #[default]
    Cover,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CollageCell {
    #[serde(default)]
    pub row: u32,
    #[serde(default)]
    pub column: u32,
    #[serde(default = "one_u32")]
    pub row_span: u32,
    #[serde(default = "one_u32")]
    pub column_span: u32,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default = "default_free_size")]
    pub width: f32,
    #[serde(default = "default_free_size")]
    pub height: f32,
    #[serde(default)]
    pub z_index: i32,
}
impl Default for CollageCell {
    fn default() -> Self {
        Self {
            row: 0,
            column: 0,
            row_span: 1,
            column_span: 1,
            x: 0.0,
            y: 0.0,
            width: 0.5,
            height: 0.5,
            z_index: 0,
        }
    }
}
fn one_u32() -> u32 {
    1
}
fn default_free_size() -> f32 {
    0.5
}

#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CollageMode {
    #[default]
    Grid,
    Strip,
    Free,
}
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StripDirection {
    #[default]
    Vertical,
    Horizontal,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CollageConfig {
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub mode: CollageMode,
    #[serde(default = "one_u32")]
    pub rows: u32,
    #[serde(default = "one_u32")]
    pub columns: u32,
    #[serde(default)]
    pub direction: StripDirection,
    #[serde(default)]
    pub outer_margin: u32,
    #[serde(default)]
    pub gap: u32,
    #[serde(default)]
    pub corner_radius: u32,
    #[serde(default)]
    pub shadow: ShadowConfig,
    #[serde(default)]
    pub background: Background,
    #[serde(default = "default_quality")]
    pub quality: u8,
}
fn default_quality() -> u8 {
    92
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShadowConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_shadow_color")]
    pub color: String,
    #[serde(default = "default_shadow_blur")]
    pub blur: u32,
    #[serde(default)]
    pub offset_x: i32,
    #[serde(default = "default_shadow_offset")]
    pub offset_y: i32,
}
impl Default for ShadowConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            color: default_shadow_color(),
            blur: 18,
            offset_x: 0,
            offset_y: 8,
        }
    }
}
fn default_shadow_color() -> String {
    "#00000055".into()
}
fn default_shadow_blur() -> u32 {
    18
}
fn default_shadow_offset() -> i32 {
    8
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Background {
    #[default]
    Solid,
    Color {
        color: String,
    },
    LinearGradient {
        colors: Vec<String>,
        #[serde(default)]
        angle: f32,
    },
    Image {
        path: String,
        #[serde(default)]
        mode: BackgroundImageMode,
    },
}
#[derive(Debug, Clone, Copy, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundImageMode {
    Tile,
    Stretch,
    #[default]
    Contain,
}

pub fn compose_to_file(
    items: &[CollageItem],
    config: &CollageConfig,
    token: &CancellationToken,
    report: Arc<dyn Fn(&str, u8) + Send + Sync>,
) -> Result<String, AppError> {
    let path = PathBuf::from(&config.output_path);
    let image = compose(items, config, token, report.clone())?;
    report("encoding", 94);
    let output = output_spec(&path, config.quality)?;
    save_image_atomic(&DynamicImage::ImageRgba8(image), &path, &output, token)?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn compose(
    items: &[CollageItem],
    config: &CollageConfig,
    token: &CancellationToken,
    report: Arc<dyn Fn(&str, u8) + Send + Sync>,
) -> Result<RgbaImage, AppError> {
    validate(items, config)?;
    let (width, height, scale) = guarded_size(config.width, config.height);
    if scale < 1.0 {
        report("memoryGuard", 2);
    }
    let mut canvas = RgbaImage::new(width, height);
    draw_background(&mut canvas, &config.background)?;
    let mut order: Vec<_> = items.iter().enumerate().collect();
    if matches!(config.mode, CollageMode::Free) {
        order.sort_by_key(|(_, item)| item.cell.z_index);
    }
    for (position, (index, item)) in order.into_iter().enumerate() {
        check_cancelled(token)?;
        let rect = item_rect(index, items.len(), item, config, scale, width, height);
        if rect.2 == 0 || rect.3 == 0 {
            continue;
        }
        draw_item(&mut canvas, item, rect, config, token)?;
        report(
            "compositing",
            5 + (((position + 1) * 86 / items.len()) as u8),
        );
    }
    Ok(canvas)
}

fn validate(items: &[CollageItem], config: &CollageConfig) -> Result<(), AppError> {
    if items.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one collage item is required".into(),
        ));
    }
    if config.width == 0 || config.height == 0 {
        return Err(AppError::InvalidInput(
            "canvas dimensions must be positive".into(),
        ));
    }
    if config.rows == 0 || config.columns == 0 {
        return Err(AppError::InvalidInput(
            "grid rows and columns must be positive".into(),
        ));
    }
    if config.width as u64 * config.height as u64 > u32::MAX as u64 * 4 {
        return Err(AppError::InvalidInput("canvas is too large".into()));
    }
    for item in items {
        if !Path::new(&item.path).is_file() {
            return Err(AppError::InvalidInput(format!(
                "source image does not exist: {}",
                item.path
            )));
        }
        if !item.transform.scale.is_finite() || item.transform.scale <= 0.0 {
            return Err(AppError::InvalidInput("item scale must be positive".into()));
        }
    }
    Ok(())
}

fn guarded_size(width: u32, height: u32) -> (u32, u32, f32) {
    let pixels = width as u64 * height as u64;
    if pixels <= MAX_PIXELS {
        return (width, height, 1.0);
    }
    let scale = (MAX_PIXELS as f64 / pixels as f64).sqrt() as f32;
    (
        ((width as f32 * scale).floor() as u32).max(1),
        ((height as f32 * scale).floor() as u32).max(1),
        scale,
    )
}

fn item_rect(
    index: usize,
    count: usize,
    item: &CollageItem,
    config: &CollageConfig,
    scale: f32,
    width: u32,
    height: u32,
) -> (i32, i32, u32, u32) {
    let margin = (config.outer_margin as f32 * scale).round() as u32;
    let gap = (config.gap as f32 * scale).round() as u32;
    let available_w = width.saturating_sub(margin.saturating_mul(2));
    let available_h = height.saturating_sub(margin.saturating_mul(2));
    match config.mode {
        CollageMode::Grid => {
            let cell_w = (available_w
                .saturating_sub(gap.saturating_mul(config.columns.saturating_sub(1))))
                / config.columns;
            let cell_h = (available_h
                .saturating_sub(gap.saturating_mul(config.rows.saturating_sub(1))))
                / config.rows;
            let col = item.cell.column.min(config.columns - 1);
            let row = item.cell.row.min(config.rows - 1);
            let span_x = item.cell.column_span.max(1).min(config.columns - col);
            let span_y = item.cell.row_span.max(1).min(config.rows - row);
            (
                (margin + col * (cell_w + gap)) as i32,
                (margin + row * (cell_h + gap)) as i32,
                cell_w * span_x + gap * span_x.saturating_sub(1),
                cell_h * span_y + gap * span_y.saturating_sub(1),
            )
        }
        CollageMode::Strip => match config.direction {
            StripDirection::Vertical => {
                let h = available_h
                    .saturating_sub(gap.saturating_mul(count.saturating_sub(1) as u32))
                    / count as u32;
                (
                    margin as i32,
                    (margin + index as u32 * (h + gap)) as i32,
                    available_w,
                    h,
                )
            }
            StripDirection::Horizontal => {
                let w = available_w
                    .saturating_sub(gap.saturating_mul(count.saturating_sub(1) as u32))
                    / count as u32;
                (
                    (margin + index as u32 * (w + gap)) as i32,
                    margin as i32,
                    w,
                    available_h,
                )
            }
        },
        CollageMode::Free => (
            (item.cell.x * width as f32).round() as i32,
            (item.cell.y * height as f32).round() as i32,
            (item.cell.width * width as f32).round().max(1.0) as u32,
            (item.cell.height * height as f32).round().max(1.0) as u32,
        ),
    }
}

fn draw_item(
    canvas: &mut RgbaImage,
    item: &CollageItem,
    rect: (i32, i32, u32, u32),
    config: &CollageConfig,
    token: &CancellationToken,
) -> Result<(), AppError> {
    let source =
        image::open(crate::image_io::source::resolve(Path::new(&item.path))?)?.into_rgba8();
    check_cancelled(token)?;
    let (sw, sh) = source.dimensions();
    let fit = match item.transform.fit {
        FitMode::Cover => (rect.2 as f64 / sw as f64).max(rect.3 as f64 / sh as f64),
        FitMode::Contain => (rect.2 as f64 / sw as f64).min(rect.3 as f64 / sh as f64),
    } * item.transform.scale as f64;
    let target_w = (sw as f64 * fit).round().max(1.0) as u32;
    let target_h = (sh as f64 * fit).round().max(1.0) as u32;
    let mut rendered = resize_rgba(source, target_w, target_h)?;
    if item.transform.rotation.abs() > 0.01 {
        rendered = rotate_about_center(
            &rendered,
            item.transform.rotation.to_radians(),
            Interpolation::Bilinear,
            Rgba([0, 0, 0, 0]),
        );
    }
    check_cancelled(token)?;
    if config.shadow.enabled {
        draw_shadow(canvas, rect, config);
    }
    let ox = rect.0
        + ((rect.2 as i32 - rendered.width() as i32) / 2)
        + (item.transform.offset_x * rect.2 as f32).round() as i32;
    let oy = rect.1
        + ((rect.3 as i32 - rendered.height() as i32) / 2)
        + (item.transform.offset_y * rect.3 as f32).round() as i32;
    let radius = ((config.corner_radius as f32 * canvas.width() as f32 / config.width as f32)
        .round() as u32)
        .min(rect.2 / 2)
        .min(rect.3 / 2) as i32;
    for py in 0..rect.3 as i32 {
        let cy = rect.1 + py;
        if cy < 0 || cy >= canvas.height() as i32 {
            continue;
        }
        for px in 0..rect.2 as i32 {
            let cx = rect.0 + px;
            if cx < 0
                || cx >= canvas.width() as i32
                || !inside_round_rect(px, py, rect.2 as i32, rect.3 as i32, radius)
            {
                continue;
            }
            let sx = cx - ox;
            let sy = cy - oy;
            if sx >= 0 && sy >= 0 && sx < rendered.width() as i32 && sy < rendered.height() as i32 {
                canvas
                    .get_pixel_mut(cx as u32, cy as u32)
                    .blend(rendered.get_pixel(sx as u32, sy as u32));
            }
        }
    }
    Ok(())
}

fn resize_rgba(source: RgbaImage, width: u32, height: u32) -> Result<RgbaImage, AppError> {
    if source.dimensions() == (width, height) {
        return Ok(source);
    }
    let (sw, sh) = source.dimensions();
    let source = Image::from_vec_u8(sw, sh, source.into_raw(), PixelType::U8x4)
        .map_err(|e| AppError::Resize(e.to_string()))?;
    let mut destination = Image::new(width, height, PixelType::U8x4);
    Resizer::new()
        .resize(&source, &mut destination, &ResizeOptions::new())
        .map_err(|e| AppError::Resize(e.to_string()))?;
    RgbaImage::from_raw(width, height, destination.into_vec())
        .ok_or_else(|| AppError::Resize("invalid RGBA resize buffer".into()))
}

fn check_cancelled(token: &CancellationToken) -> Result<(), AppError> {
    if token.is_cancelled() {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

fn inside_round_rect(x: i32, y: i32, w: i32, h: i32, r: i32) -> bool {
    if r <= 0 || (x >= r && x < w - r) || (y >= r && y < h - r) {
        return true;
    }
    let (cx, cy) = (
        if x < r { r } else { w - r - 1 },
        if y < r { r } else { h - r - 1 },
    );
    let (dx, dy) = (x - cx, y - cy);
    dx * dx + dy * dy <= r * r
}

fn draw_shadow(canvas: &mut RgbaImage, rect: (i32, i32, u32, u32), config: &CollageConfig) {
    let color = parse_color(&config.shadow.color, Rgba([0, 0, 0, 85]));
    let spread = (config.shadow.blur / 3) as i32;
    let x0 = rect.0 + config.shadow.offset_x - spread;
    let y0 = rect.1 + config.shadow.offset_y - spread;
    for y in y0..(rect.1 + rect.3 as i32 + config.shadow.offset_y + spread) {
        for x in x0..(rect.0 + rect.2 as i32 + config.shadow.offset_x + spread) {
            if x >= 0 && y >= 0 && x < canvas.width() as i32 && y < canvas.height() as i32 {
                canvas.get_pixel_mut(x as u32, y as u32).blend(&color);
            }
        }
    }
}

fn draw_background(canvas: &mut RgbaImage, background: &Background) -> Result<(), AppError> {
    match background {
        Background::Solid => canvas.fill(255),
        Background::Color { color } => {
            let value = parse_color(color, Rgba([255, 255, 255, 255]));
            for pixel in canvas.pixels_mut() {
                *pixel = value;
            }
        }
        Background::LinearGradient { colors, angle } => {
            let a = parse_color(
                colors.first().map(String::as_str).unwrap_or("#FFFFFF"),
                Rgba([255, 255, 255, 255]),
            );
            let b = parse_color(
                colors.get(1).map(String::as_str).unwrap_or("#000000"),
                Rgba([0, 0, 0, 255]),
            );
            let radians = angle.to_radians();
            let dx = radians.cos();
            let dy = radians.sin();
            let width = canvas.width().max(1) as f32;
            let height = canvas.height().max(1) as f32;
            for (x, y, pixel) in canvas.enumerate_pixels_mut() {
                let nx = x as f32 / width - 0.5;
                let ny = y as f32 / height - 0.5;
                let t = (nx * dx + ny * dy + 0.5).clamp(0.0, 1.0);
                *pixel = Rgba(std::array::from_fn(|i| {
                    (a[i] as f32 * (1.0 - t) + b[i] as f32 * t).round() as u8
                }));
            }
        }
        Background::Image { path, mode } => {
            let source = image::open(path)?.into_rgba8();
            match mode {
                BackgroundImageMode::Tile => {
                    for y in (0..canvas.height()).step_by(source.height() as usize) {
                        for x in (0..canvas.width()).step_by(source.width() as usize) {
                            imageops::overlay(canvas, &source, x.into(), y.into());
                        }
                    }
                }
                BackgroundImageMode::Stretch => {
                    let resized = resize_rgba(source, canvas.width(), canvas.height())?;
                    imageops::overlay(canvas, &resized, 0, 0);
                }
                BackgroundImageMode::Contain => {
                    let (sw, sh) = source.dimensions();
                    let scale =
                        (canvas.width() as f64 / sw as f64).min(canvas.height() as f64 / sh as f64);
                    let resized = resize_rgba(
                        source,
                        (sw as f64 * scale).max(1.0) as u32,
                        (sh as f64 * scale).max(1.0) as u32,
                    )?;
                    imageops::overlay(
                        canvas,
                        &resized,
                        ((canvas.width() - resized.width()) / 2).into(),
                        ((canvas.height() - resized.height()) / 2).into(),
                    );
                }
            }
        }
    }
    Ok(())
}

fn parse_color(value: &str, fallback: Rgba<u8>) -> Rgba<u8> {
    let value = value.trim().trim_start_matches('#');
    if value.len() != 6 && value.len() != 8 {
        return fallback;
    }
    let read = |start| u8::from_str_radix(&value[start..start + 2], 16).ok();
    match (
        read(0),
        read(2),
        read(4),
        if value.len() == 8 { read(6) } else { Some(255) },
    ) {
        (Some(r), Some(g), Some(b), Some(a)) => Rgba([r, g, b, a]),
        _ => fallback,
    }
}

fn output_spec(path: &Path, quality: u8) -> Result<OutputSpec, AppError> {
    let extension = path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let format = match extension.as_str() {
        "jpg" | "jpeg" => OutputFormat::Jpeg,
        "png" => OutputFormat::Png,
        "webp" => OutputFormat::Webp,
        _ => {
            return Err(AppError::InvalidInput(
                "output path must end in .jpg, .png, or .webp".into(),
            ))
        }
    };
    Ok(OutputSpec {
        format,
        quality: quality.clamp(1, 100),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn large_canvas_is_limited_to_one_hundred_megapixels() {
        let (w, h, s) = guarded_size(20_000, 10_000);
        assert!(w as u64 * h as u64 <= MAX_PIXELS);
        assert!(s < 1.0);
    }
    #[test]
    fn color_parser_accepts_alpha() {
        assert_eq!(
            parse_color("#11223344", Rgba([0; 4])),
            Rgba([17, 34, 51, 68])
        );
    }

    #[test]
    #[ignore]
    fn composes_and_encodes_four_12mp_images_under_five_seconds_in_release() {
        use std::time::{Duration, Instant, SystemTime};
        let directory = std::env::temp_dir().join(format!(
            "still-collage-bench-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let source = directory.join("source.png");
        RgbaImage::from_pixel(4_000, 3_000, Rgba([82, 116, 91, 255]))
            .save(&source)
            .unwrap();
        let output_path = directory.join("collage.png");
        let items = (0..4)
            .map(|index| CollageItem {
                path: source.to_string_lossy().into_owned(),
                transform: ItemTransform::default(),
                cell: CollageCell {
                    row: index / 2,
                    column: index % 2,
                    ..CollageCell::default()
                },
            })
            .collect::<Vec<_>>();
        let config = CollageConfig {
            output_path: output_path.to_string_lossy().into_owned(),
            width: 8_000,
            height: 6_000,
            mode: CollageMode::Grid,
            rows: 2,
            columns: 2,
            direction: StripDirection::Vertical,
            outer_margin: 0,
            gap: 20,
            corner_radius: 0,
            shadow: ShadowConfig::default(),
            background: Background::Color {
                color: "#FFFFFF".into(),
            },
            quality: 92,
        };
        let started = Instant::now();
        let token = CancellationToken::new();
        let image = compose(&items, &config, &token, Arc::new(|_, _| {})).unwrap();
        save_image_atomic(
            &DynamicImage::ImageRgba8(image),
            &output_path,
            &OutputSpec {
                format: OutputFormat::Png,
                quality: 100,
            },
            &token,
        )
        .unwrap();
        let elapsed = started.elapsed();
        eprintln!("8000x6000 collage export: {elapsed:?}");
        assert!(
            elapsed < Duration::from_secs(5),
            "collage export took {elapsed:?}"
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
}
