//! Generate lossless reference images using the production Rust pipeline.
#[allow(dead_code)]
#[path = "../src/error.rs"]
mod error;
#[allow(dead_code)]
#[path = "../src/image_io/mod.rs"]
mod image_io;
#[allow(dead_code)]
#[path = "../src/render/mod.rs"]
mod render;

use render::{pipeline::apply_render_spec, spec::RenderSpec};
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::SystemTime};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let parent = PathBuf::from(std::env::args_os().nth(1).ok_or("expected output parent")?);
    fs::create_dir_all(&parent)?;
    let name = format!(
        "render-parity-{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)?
            .as_nanos()
    );
    let directory = parent.join(&name);
    fs::create_dir(&directory)?;
    let source = directory.join("source.png");
    image::RgbImage::from_fn(128, 96, |x, y| {
        image::Rgb([(x * 17 + y * 3) as u8, (y * 13 + x) as u8, (x ^ y) as u8])
    })
    .save(&source)?;
    image::RgbaImage::new(128, 96).save(directory.join("transparent.png"))?;
    let mut cases: Vec<(String, Value, bool)> = Vec::new();
    for angle in [0, 90, 180, 270] {
        for flip_h in [false, true] {
            for flip_v in [false, true] {
                cases.push((
                    format!("rotation-{angle}-h{flip_h}-v{flip_v}"),
                    json!({"rotation": {"angle": angle, "flipH": flip_h, "flipV": flip_v}}),
                    true,
                ));
            }
        }
    }
    let crop = json!({"enabled": true, "aspect": "free", "rect": {
        "x": 0.123, "y": 0.234, "width": 0.567, "height": 0.543
    }});
    cases.push(("crop-rounding".into(), json!({"crop": crop}), true));
    cases.push((
        "rotate-flip-crop".into(),
        json!({"crop": crop,
        "rotation": {"angle": 90, "flipH": true, "flipV": false}}),
        true,
    ));
    let border = json!({"style": "solid", "width": 8, "unit": "px", "color": "#376149",
        "radius": 0, "colors": ["#376149", "#D8E7DE"], "angle": 37, "caption": false});
    for style in ["solid", "polaroid", "film", "gradient"] {
        let mut cfg = border.clone();
        cfg["style"] = json!(style);
        cases.push((
            format!("border-{style}"),
            json!({"border": cfg}),
            style != "gradient",
        ));
    }
    let mut percent = border.clone();
    percent["unit"] = json!("percent");
    percent["width"] = json!(5);
    cases.push((
        "crop-percent-border".into(),
        json!({"crop": crop, "border": percent}),
        true,
    ));
    let mut rounded = border.clone();
    rounded["radius"] = json!(17);
    cases.push(("rounded-border".into(), json!({"border": rounded}), false));
    cases.push((
        "adjustments".into(),
        json!({"adjustments": {
            "exposure": 0.4, "contrast": 0.15, "saturation": -0.3
        }}),
        false,
    ));
    let watermark = json!({"type": "text", "content": "Still 测试\n© 2026 😀",
        "position": "center", "offsetX": 0, "offsetY": 0, "opacity": 0.72,
        "rotation": 0, "scale": 1, "tiled": false, "tileGap": 24,
        "font": {"family": "Noto Sans SC", "path": PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources/fonts/NotoSansSC-VF.ttf").to_string_lossy(),
        "size": 12, "sizeUnit": "px", "weight": 400,
        "italic": false, "color": "#FFFFFF", "strokeColor": "#000000", "strokeWidth": 0,
        "shadow": {"color": "#00000000", "blur": 0, "offsetX": 0, "offsetY": 0}}});
    cases.push((
        "text-watermark".into(),
        json!({"watermark": watermark}),
        false,
    ));
    cases.push((
        "border-text-watermark".into(),
        json!({"border": border, "watermark": watermark}),
        false,
    ));
    cases.push((
        "crop-text-watermark".into(),
        json!({"crop": crop, "watermark": watermark}),
        false,
    ));
    for (id, content) in [
        ("chinese", "测试"),
        ("latin", "Still"),
        ("emoji", "😀"),
        ("multiline", "测试\nStill 😀\n"),
    ] {
        let mut mark = watermark.clone();
        mark["content"] = json!(content);
        mark["font"]["size"] = json!(24);
        cases.push((
            format!("transparent-{id}"),
            json!({"fixtureSource": "transparent.png", "watermark": mark}),
            false,
        ));
    }
    let mut percent_mark = watermark.clone();
    percent_mark["font"]["size"] = json!(8);
    percent_mark["font"]["sizeUnit"] = json!("percent");
    cases.push((
        "crop-percent-text-watermark".into(),
        json!({"crop": crop, "border": border, "watermark": percent_mark}),
        false,
    ));
    for (id, angle, tiled) in [
        ("rotate-45", 45, false),
        ("rotate-90", 90, false),
        ("rotate-negative-90", -90, false),
        ("rotate-tiled", 45, true),
    ] {
        let mut mark = watermark.clone();
        mark["content"] = json!("Still 测试");
        mark["rotation"] = json!(angle);
        mark["tiled"] = json!(tiled);
        cases.push((
            format!("transparent-{id}"),
            json!({"fixtureSource": "transparent.png", "watermark": mark}),
            false,
        ));
    }
    let mut manifest = Vec::new();
    for (id, mut value, exact) in cases {
        value["version"] = json!(1);
        let source_file = value
            .as_object_mut()
            .unwrap()
            .remove("fixtureSource")
            .and_then(|v| v.as_str().map(str::to_owned))
            .unwrap_or_else(|| "source.png".into());
        let case_source = directory.join(&source_file);
        value["source"] =
            json!({"path": case_source.to_string_lossy(), "width": 128, "height": 96});
        let spec: RenderSpec = serde_json::from_value(value)?;
        let rendered = apply_render_spec(&case_source, &spec)?;
        rendered.save(directory.join(format!("{id}.png")))?;
        manifest.push(
            json!({"id": id, "sourceFile": source_file, "spec": spec, "exact": exact,
            "width": rendered.width(), "height": rendered.height()}),
        );
    }
    fs::write(
        directory.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;
    println!(
        "Generated {} cases in {}",
        manifest.len(),
        directory.display()
    );
    println!("Browser: http://localhost:1420/tests/fixtures/render-parity.html?run={name}");
    Ok(())
}
