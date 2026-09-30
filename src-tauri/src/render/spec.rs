use serde::{Deserialize, Serialize};

pub const RENDER_SPEC_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderSpec {
    pub version: u8,
    pub source: SourceSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotation: Option<RotationSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub crop: Option<CropSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<BorderConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watermark: Option<WatermarkSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adjustments: Option<AdjustmentsSpec>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<OutputSpec>,
}

impl RenderSpec {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != RENDER_SPEC_VERSION {
            return Err(format!(
                "unsupported RenderSpec version {}; expected {RENDER_SPEC_VERSION}",
                self.version
            ));
        }
        if self.source.path.trim().is_empty() {
            return Err("source.path must not be empty".into());
        }
        if self.source.width == 0 || self.source.height == 0 {
            return Err("source dimensions must be greater than zero".into());
        }
        if let Some(rotation) = &self.rotation {
            rotation.validate()?;
        }
        if let Some(border) = &self.border {
            border.validate()?;
        }
        if let Some(watermark) = &self.watermark {
            watermark.validate()?;
        }
        if let Some(adjustments) = &self.adjustments {
            adjustments.validate()?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceSpec {
    pub path: String,
    pub width: u32,
    pub height: u32,
}

/// Clockwise quarter turns followed by flips in the rotated display space.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct RotationSpec {
    pub angle: u16,
    pub flip_h: bool,
    pub flip_v: bool,
}

impl RotationSpec {
    fn validate(&self) -> Result<(), String> {
        if !matches!(self.angle, 0 | 90 | 180 | 270) {
            return Err("rotation.angle must be 0, 90, 180 or 270".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CropSpec {
    pub aspect: CropAspect,
    pub rect: CropRect,
    pub enabled: bool,
}

/// Coordinates in 0..=1 after EXIF normalization, rotation and flips.
/// Fixed aspects constrain the pixel rectangle's ratio, not width / height here.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Default for CropRect {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub enum CropAspect {
    #[default]
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "free")]
    Free,
    #[serde(rename = "1:1")]
    Square,
    #[serde(rename = "4:3")]
    FourThree,
    #[serde(rename = "3:2")]
    ThreeTwo,
    #[serde(rename = "16:9")]
    SixteenNine,
    #[serde(rename = "2:3")]
    TwoThree,
    #[serde(rename = "3:4")]
    ThreeFour,
    #[serde(rename = "9:16")]
    NineSixteen,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BorderConfig {
    pub style: BorderStyle,
    pub width: f32,
    pub unit: BorderUnit,
    pub color: String,
    pub radius: f32,
    pub colors: Vec<String>,
    pub angle: f32,
    pub caption: bool,
}

impl BorderConfig {
    fn validate(&self) -> Result<(), String> {
        for (name, value, maximum) in [
            ("width", self.width, 10_000.0),
            ("radius", self.radius, 10_000.0),
        ] {
            if !value.is_finite() || !(0.0..=maximum).contains(&value) {
                return Err(format!("border.{name} must be finite and in 0..={maximum}"));
            }
        }
        if !self.angle.is_finite() {
            return Err("border angle must be finite".into());
        }
        if self.style == BorderStyle::Gradient && self.colors.len() < 2 {
            return Err("gradient borders need at least two colors".into());
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BorderUnit {
    Px,
    Percent,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BorderStyle {
    Solid,
    Gradient,
    Polaroid,
    Film,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WatermarkSpec {
    #[serde(rename = "type")]
    pub kind: WatermarkType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub position: Anchor,
    pub offset_x: f32,
    pub offset_y: f32,
    pub opacity: f32,
    pub rotation: f32,
    pub scale: f32,
    #[serde(default)]
    pub tiled: bool,
    #[serde(default = "default_tile_gap")]
    pub tile_gap: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free_position: Option<NormalizedPoint>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<FontSpec>,
}

fn default_tile_gap() -> f32 {
    96.0
}

impl WatermarkSpec {
    pub(crate) fn validate(&self) -> Result<(), String> {
        for (name, value, min, max) in [
            ("opacity", self.opacity, 0.0, 1.0),
            ("rotation", self.rotation, -180.0, 180.0),
            ("scale", self.scale, 0.01, 20.0),
            ("tileGap", self.tile_gap, 0.0, 10_000.0),
            ("offsetX", self.offset_x, -100_000.0, 100_000.0),
            ("offsetY", self.offset_y, -100_000.0, 100_000.0),
        ] {
            if !value.is_finite() || !(min..=max).contains(&value) {
                return Err(format!(
                    "watermark.{name} must be finite and in {min}..={max}"
                ));
            }
        }
        if self.kind == WatermarkType::Text && self.content.trim().is_empty() {
            return Err("text watermark content must not be empty".into());
        }
        if self.kind == WatermarkType::Text && self.font.is_none() {
            return Err("text watermark font must not be empty".into());
        }
        if self.kind == WatermarkType::Image && self.path.as_deref().unwrap_or("").trim().is_empty()
        {
            return Err("image watermark path must not be empty".into());
        }
        if let Some(point) = self.free_position {
            if !point.x.is_finite()
                || !point.y.is_finite()
                || !(0.0..=1.0).contains(&point.x)
                || !(0.0..=1.0).contains(&point.y)
            {
                return Err("watermark.freePosition must be normalized to 0..=1".into());
            }
        }
        if let Some(font) = &self.font {
            font.validate()?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NormalizedPoint {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkType {
    Text,
    Image,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Anchor {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FontSpec {
    pub family: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    pub size: f32,
    #[serde(default)]
    pub size_unit: FontSizeUnit,
    pub weight: u16,
    pub italic: bool,
    pub color: String,
    #[serde(default = "default_stroke_color")]
    pub stroke_color: String,
    #[serde(default)]
    pub stroke_width: f32,
    #[serde(default)]
    pub shadow: TextShadow,
}

fn default_stroke_color() -> String {
    "#000000".into()
}

impl FontSpec {
    fn validate(&self) -> Result<(), String> {
        if !self.size.is_finite() || !(1.0..=2_000.0).contains(&self.size) {
            return Err("watermark.font.size must be in 1..=2000".into());
        }
        if !self.stroke_width.is_finite() || !(0.0..=100.0).contains(&self.stroke_width) {
            return Err("watermark.font.strokeWidth must be in 0..=100".into());
        }
        self.shadow.validate()
    }
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FontSizeUnit {
    #[default]
    Px,
    Percent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TextShadow {
    #[serde(default = "default_shadow_color")]
    pub color: String,
    #[serde(default)]
    pub blur: f32,
    #[serde(default)]
    pub offset_x: f32,
    #[serde(default)]
    pub offset_y: f32,
}

fn default_shadow_color() -> String {
    "#00000080".into()
}

impl Default for TextShadow {
    fn default() -> Self {
        Self {
            color: default_shadow_color(),
            blur: 0.0,
            offset_x: 0.0,
            offset_y: 0.0,
        }
    }
}

impl TextShadow {
    fn validate(&self) -> Result<(), String> {
        for value in [self.blur, self.offset_x, self.offset_y] {
            if !value.is_finite() || !(-1_000.0..=1_000.0).contains(&value) {
                return Err("watermark font shadow values are out of range".into());
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdjustmentsSpec {
    pub exposure: f32,
    pub contrast: f32,
    pub saturation: f32,
}

impl AdjustmentsSpec {
    fn validate(&self) -> Result<(), String> {
        if !self.exposure.is_finite() || !(-5.0..=5.0).contains(&self.exposure) {
            return Err("adjustments.exposure must be finite and in -5..=5".into());
        }
        for (name, value) in [("contrast", self.contrast), ("saturation", self.saturation)] {
            if !value.is_finite() || !(-1.0..=1.0).contains(&value) {
                return Err(format!("adjustments.{name} must be finite and in -1..=1"));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OutputSpec {
    pub format: OutputFormat,
    pub quality: u8,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    Jpeg,
    Png,
    Webp,
}

#[cfg(test)]
mod tests {
    use super::{
        BorderConfig, BorderStyle, BorderUnit, OutputFormat, OutputSpec, RenderSpec, SourceSpec,
        RENDER_SPEC_VERSION,
    };

    #[test]
    fn old_specs_without_rotation_remain_compatible() {
        let value = serde_json::json!({
            "version": 1,
            "source": { "path": "photo.jpg", "width": 4000, "height": 3000 }
        });
        let spec: RenderSpec = serde_json::from_value(value.clone()).expect("read old spec");
        assert!(spec.rotation.is_none());
        assert_eq!(
            spec.rotation.unwrap_or_default(),
            super::RotationSpec::default()
        );
        spec.validate().expect("validate old spec");
        assert_eq!(serde_json::to_value(spec).unwrap(), value);
    }

    #[test]
    fn rotation_defaults_match_the_typescript_contract() {
        let rotation: super::RotationSpec = serde_json::from_str("{}").expect("default rotation");
        assert_eq!(rotation, super::RotationSpec::default());
        assert_eq!(
            serde_json::to_value(rotation).unwrap(),
            serde_json::json!({
                "angle": 0, "flipH": false, "flipV": false
            })
        );
    }

    #[test]
    fn rotation_angles_and_flips_round_trip_with_typescript_field_names() {
        for angle in [0, 90, 180, 270] {
            for flip_h in [false, true] {
                for flip_v in [false, true] {
                    let value = serde_json::json!({
                        "version": 1,
                        "source": { "path": "photo.jpg", "width": 4000, "height": 3000 },
                        "rotation": { "angle": angle, "flipH": flip_h, "flipV": flip_v }
                    });
                    let spec: RenderSpec = serde_json::from_value(value.clone()).unwrap();
                    spec.validate().expect("validate rotation");
                    assert_eq!(serde_json::to_value(spec).unwrap(), value);
                }
            }
        }
    }

    #[test]
    fn rejects_non_quarter_turn_rotation_angles() {
        for angle in [1, 45, 91, 360] {
            let spec: RenderSpec = serde_json::from_value(serde_json::json!({
                "version": 1,
                "source": { "path": "photo.jpg", "width": 4000, "height": 3000 },
                "rotation": { "angle": angle }
            }))
            .expect("deserialize integer angle");
            assert!(spec.validate().is_err());
        }
        for angle in [serde_json::json!(-90), serde_json::json!(90.5)] {
            assert!(
                serde_json::from_value::<super::RotationSpec>(serde_json::json!({
                    "angle": angle
                }))
                .is_err()
            );
        }
    }

    #[test]
    fn old_specs_without_crop_remain_compatible() {
        let value = serde_json::json!({
            "version": 1,
            "source": { "path": "photo.jpg", "width": 4000, "height": 3000 }
        });
        let spec: RenderSpec = serde_json::from_value(value).expect("read old spec");
        assert!(spec.crop.is_none());
        spec.validate().expect("validate old spec");
        assert!(serde_json::to_value(spec).unwrap().get("crop").is_none());
    }

    #[test]
    fn crop_defaults_and_aspects_match_the_typescript_contract() {
        use super::{CropAspect, CropSpec};

        let default = serde_json::json!({
            "aspect": "original",
            "rect": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0 },
            "enabled": false
        });
        let crop: CropSpec = serde_json::from_str("{}").expect("default crop");
        assert_eq!(crop, CropSpec::default());
        assert_eq!(serde_json::to_value(crop).unwrap(), default);

        for aspect in [
            "original", "free", "1:1", "4:3", "3:2", "16:9", "2:3", "3:4", "9:16",
        ] {
            let parsed: CropAspect = serde_json::from_value(serde_json::json!(aspect)).unwrap();
            assert_eq!(serde_json::to_value(parsed).unwrap(), aspect);
            let value = serde_json::json!({
                "version": 1,
                "source": { "path": "photo.jpg", "width": 4000, "height": 3000 },
                "crop": {
                    "aspect": aspect,
                    "rect": { "x": 0.125, "y": 0.25, "width": 0.5, "height": 0.5 },
                    "enabled": true
                }
            });
            let spec: RenderSpec = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(spec).unwrap(), value);
        }
    }

    #[test]
    fn serializes_with_the_typescript_field_names() {
        let spec = RenderSpec {
            version: RENDER_SPEC_VERSION,
            source: SourceSpec {
                path: "photo.jpg".into(),
                width: 4_000,
                height: 3_000,
            },
            border: None,
            rotation: None,
            crop: None,
            watermark: None,
            adjustments: None,
            output: Some(OutputSpec {
                format: OutputFormat::Jpeg,
                quality: 90,
            }),
        };

        let value = serde_json::to_value(spec).expect("serialize RenderSpec");
        assert_eq!(value["version"], 1);
        assert_eq!(value["source"]["width"], 4_000);
        assert_eq!(value["output"]["format"], "jpeg");
        assert!(value.get("border").is_none());
    }

    #[test]
    fn border_contract_uses_canvas_field_names() {
        let border = BorderConfig {
            style: BorderStyle::Gradient,
            width: 20.0,
            unit: BorderUnit::Percent,
            color: "#11223380".into(),
            radius: 12.0,
            colors: vec!["#FFFFFF".into(), "#000000".into()],
            angle: 45.0,
            caption: false,
        };
        let value = serde_json::to_value(border).expect("serialize border");
        assert_eq!(value["style"], "gradient");
        assert_eq!(value["unit"], "percent");
        assert!(value.get("spread").is_none());
        assert!(value.get("blur").is_none());
        assert!(value.get("offsetY").is_none());
    }
}
