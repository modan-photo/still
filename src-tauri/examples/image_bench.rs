//! Standalone benchmark reusing production I/O without starting a Tauri window.
#[path = "../src/error.rs"]
mod error;
#[path = "../src/image_io/mod.rs"]
mod image_io;
#[path = "../src/render/mod.rs"]
mod render;

use image_io::{
    load::inspect_image,
    save::save_image_atomic,
    thumb::{get_or_create_cached, get_or_create_cached_batch, CacheKind},
};
use render::spec::{OutputFormat, OutputSpec};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use tokio_util::sync::CancellationToken;

fn main() {
    if let Err(error) = run() {
        eprintln!("Benchmark failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.len() != 2 {
        return Err(
            "Usage: image_bench <image-directory|--smoke> <existing-output-directory>".into(),
        );
    }
    let smoke = args[0] == "--smoke";
    let parent = PathBuf::from(&args[1]);
    if !parent.is_dir() {
        return Err("output directory must already exist".into());
    }
    let run_dir = parent.join(format!(
        "image-bench-{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos()
    ));
    fs::create_dir(&run_dir)?;
    // Never clear a supplied directory. Each run owns a fresh cache and outputs.
    let source_dir = if smoke {
        let dir = run_dir.join("fixtures");
        fs::create_dir(&dir)?;
        for index in 0..3 {
            image::RgbImage::from_fn(640, 480, |x, y| {
                image::Rgb([(x % 251) as u8, (y % 251) as u8, index * 40])
            })
            .save(dir.join(format!("fixture-{index}.jpg")))?;
        }
        dir
    } else {
        fs::canonicalize(&args[0])?
    };
    let mut paths: Vec<PathBuf> = fs::read_dir(&source_dir)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|path| path.is_file() && supported(path))
        .collect();
    paths.sort();
    if paths.is_empty() {
        return Err("no supported images in input directory (scan is non-recursive)".into());
    }
    let token = CancellationToken::new();
    let mut images = Vec::new();
    for (index, path) in paths.iter().enumerate() {
        let start = Instant::now();
        let info = inspect_image(path)?;
        let metadata_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        let preview = get_or_create_cached(
            path,
            &run_dir.join("preview-cache"),
            CacheKind::Preview,
            &token,
        )?;
        let preview_ms = start.elapsed().as_secs_f64() * 1000.0;
        if preview.width.max(preview.height) > 2048 || preview.cache_hit {
            return Err("invalid cold preview result".into());
        }
        let start = Instant::now();
        let cached = get_or_create_cached(
            path,
            &run_dir.join("preview-cache"),
            CacheKind::Preview,
            &token,
        )?;
        let preview_hit_ms = start.elapsed().as_secs_f64() * 1000.0;
        if !cached.cache_hit {
            return Err("repeat preview did not hit cache".into());
        }
        let start = Instant::now();
        let decoded = image_io::load::decode_image(path)?;
        let decoded_bytes = decoded.as_bytes().len();
        let decode_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        save_image_atomic(
            &decoded,
            &run_dir.join(format!("export-{index}.jpg")),
            &OutputSpec {
                format: OutputFormat::Jpeg,
                quality: 90,
            },
            &token,
        )?;
        let encode_ms = start.elapsed().as_secs_f64() * 1000.0;
        images.push(json!({"path": path, "width": info.width, "height": info.height, "metadataMs": metadata_ms,
            "coldPreviewMs": preview_ms, "cachedPreviewMs": preview_hit_ms, "decodeMs": decode_ms,
            "jpegEncodeMs": encode_ms, "decodeAndExportMs": decode_ms + encode_ms, "decodedBytes": decoded_bytes}));
        eprintln!("Measured {}/{}", index + 1, paths.len());
    }
    let start = Instant::now();
    let cold = get_or_create_cached_batch(
        &paths,
        &run_dir.join("batch-cache"),
        CacheKind::Thumbnail,
        &token,
    );
    let batch_ms = start.elapsed().as_secs_f64() * 1000.0;
    for result in cold {
        if result?.cache_hit {
            return Err("cold batch unexpectedly hit cache".into());
        }
    }
    let start = Instant::now();
    let warm = get_or_create_cached_batch(
        &paths,
        &run_dir.join("batch-cache"),
        CacheKind::Thumbnail,
        &token,
    );
    let warm_ms = start.elapsed().as_secs_f64() * 1000.0;
    for result in warm {
        if !result?.cache_hit {
            return Err("repeat batch missed cache".into());
        }
    }
    let report = json!({"schemaVersion": 1, "synthetic": smoke, "debugBuild": cfg!(debug_assertions),
        "os": std::env::consts::OS, "arch": std::env::consts::ARCH, "rayonThreads": rayon::current_num_threads(),
        "imageCount": paths.len(), "coldThumbnailBatchMs": batch_ms, "cachedThumbnailBatchMs": warm_ms,
        "peakMemoryBytes": null, "images": images,
        "limitations": "Cold means empty application cache, not cold OS disk cache. Batch uses Rayon API, not the UI's two-worker queue. Memory and Canvas frame rate are not measured. JPEG exports reencode at quality 90."});
    let report_path = run_dir.join("report.json");
    fs::write(&report_path, serde_json::to_vec_pretty(&report)?)?;
    println!("{}", report_path.display());
    Ok(())
}

fn supported(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tif" | "tiff"
            )
        })
}
