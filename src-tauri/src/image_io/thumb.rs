use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use fast_image_resize::{images::Image, PixelType, ResizeOptions, Resizer};
use image::{DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

use crate::{
    error::AppError,
    image_io::{load::decode_image, save::save_image_atomic},
    render::spec::{OutputFormat, OutputSpec},
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CacheKind {
    Thumbnail,
    Preview,
}

impl CacheKind {
    pub const fn long_edge(self) -> u32 {
        match self {
            Self::Thumbnail => 512,
            Self::Preview => 2_048,
        }
    }

    const fn directory(self) -> &'static str {
        match self {
            Self::Thumbnail => "thumbs",
            Self::Preview => "previews",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CachedImage {
    pub path: PathBuf,
    pub width: u32,
    pub height: u32,
    pub cache_hit: bool,
}

pub fn get_or_create_cached(
    source_path: &Path,
    cache_root: &Path,
    kind: CacheKind,
    cancellation: &CancellationToken,
) -> Result<CachedImage, AppError> {
    ensure_not_cancelled(cancellation)?;
    let destination = cache_path(source_path, cache_root, kind)?;

    if destination.is_file() {
        return cached_result(destination, true);
    }

    let image = decode_image(source_path)?;
    ensure_not_cancelled(cancellation)?;
    let resized = resize_to_long_edge(image, kind.long_edge())?;
    ensure_not_cancelled(cancellation)?;

    let parent = destination
        .parent()
        .expect("cache path always has a parent");
    fs::create_dir_all(parent)?;
    let output = OutputSpec {
        format: OutputFormat::Webp,
        quality: 90,
    };

    match save_image_atomic(&resized, &destination, &output, cancellation) {
        Ok(()) => cached_result(destination, false),
        Err(_) if cancellation.is_cancelled() => Err(AppError::Cancelled),
        Err(_) if destination.is_file() => cached_result(destination, true),
        Err(error) => Err(error),
    }
}

fn resize_to_long_edge(image: DynamicImage, target: u32) -> Result<DynamicImage, AppError> {
    let rgba = image.into_rgba8();
    let (source_width, source_height) = rgba.dimensions();
    let source_long_edge = source_width.max(source_height);
    if source_long_edge <= target {
        return Ok(DynamicImage::ImageRgba8(rgba));
    }

    let scale = f64::from(target) / f64::from(source_long_edge);
    let width = (f64::from(source_width) * scale).round().max(1.0) as u32;
    let height = (f64::from(source_height) * scale).round().max(1.0) as u32;
    let source = Image::from_vec_u8(
        source_width,
        source_height,
        rgba.into_raw(),
        PixelType::U8x4,
    )
    .map_err(|error| AppError::Resize(error.to_string()))?;
    let mut destination = Image::new(width, height, PixelType::U8x4);
    Resizer::new()
        .resize(&source, &mut destination, &ResizeOptions::new())
        .map_err(|error| AppError::Resize(error.to_string()))?;
    let pixels = RgbaImage::from_raw(width, height, destination.into_vec())
        .ok_or_else(|| AppError::Resize("resizer returned an invalid RGBA buffer".into()))?;

    Ok(DynamicImage::ImageRgba8(pixels))
}

pub fn cache_hash(source_path: &Path) -> Result<String, AppError> {
    let metadata = fs::metadata(source_path)?;
    let canonical = fs::canonicalize(source_path)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let mut hasher = DefaultHasher::new();
    canonical.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    modified.hash(&mut hasher);
    Ok(format!("{:016x}", hasher.finish()))
}

fn cache_path(source_path: &Path, cache_root: &Path, kind: CacheKind) -> Result<PathBuf, AppError> {
    let hash = cache_hash(source_path)?;

    Ok(cache_root
        .join(kind.directory())
        .join(format!("{hash}.webp")))
}

fn cached_result(path: PathBuf, cache_hit: bool) -> Result<CachedImage, AppError> {
    let (width, height) = image::image_dimensions(&path)?;
    Ok(CachedImage {
        path,
        width,
        height,
        cache_hit,
    })
}

fn ensure_not_cancelled(cancellation: &CancellationToken) -> Result<(), AppError> {
    if cancellation.is_cancelled() {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, time::SystemTime};

    use image::{Rgba, RgbaImage};
    use tokio_util::sync::CancellationToken;

    use super::{get_or_create_cached, CacheKind};

    #[test]
    fn creates_a_bounded_thumbnail_and_hits_the_cache_on_repeat() {
        let directory = std::env::temp_dir().join(format!(
            "still-thumb-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos()
        ));
        let cache = directory.join("cache");
        fs::create_dir_all(&directory).expect("create test directory");
        let source = directory.join("wide.png");
        RgbaImage::from_pixel(1_024, 256, Rgba([80, 100, 120, 255]))
            .save(&source)
            .expect("write source image");
        let cancellation = CancellationToken::new();

        let generated = get_or_create_cached(&source, &cache, CacheKind::Thumbnail, &cancellation)
            .expect("generate thumbnail");
        let cached = get_or_create_cached(&source, &cache, CacheKind::Thumbnail, &cancellation)
            .expect("load cached thumbnail");

        assert_eq!((generated.width, generated.height), (512, 128));
        assert!(!generated.cache_hit);
        assert!(cached.cache_hit);
        assert_eq!(generated.path, cached.path);

        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn multiple_jpegs_reuse_cache_and_preview_is_bounded() {
        let directory = std::env::temp_dir().join(format!(
            "still-batch-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let source = directory.join("source.jpg");
        image::RgbImage::from_fn(2304, 768, |x, y| {
            image::Rgb([(x % 251) as u8, (y % 251) as u8, 90])
        })
        .save(&source)
        .unwrap();
        let paths: Vec<_> = (0..6)
            .map(|index| {
                let path = directory.join(format!("photo-{index}.jpg"));
                fs::copy(&source, &path).unwrap();
                path
            })
            .collect();
        let token = CancellationToken::new();
        let cache = directory.join("cache");
        let first: Vec<_> = paths
            .iter()
            .map(|path| get_or_create_cached(path, &cache, CacheKind::Thumbnail, &token))
            .collect();
        assert!(first.iter().all(|result| result
            .as_ref()
            .is_ok_and(|image| !image.cache_hit && image.width == 512)));
        let second: Vec<_> = paths
            .iter()
            .map(|path| get_or_create_cached(path, &cache, CacheKind::Thumbnail, &token))
            .collect();
        assert!(second
            .iter()
            .all(|result| result.as_ref().is_ok_and(|image| image.cache_hit)));
        assert_eq!(fs::read_dir(cache.join("thumbs")).unwrap().count(), 6);
        let preview = get_or_create_cached(&source, &cache, CacheKind::Preview, &token).unwrap();
        assert_eq!((preview.width, preview.height), (2048, 683));
        fs::remove_dir_all(directory).unwrap();
    }
}
