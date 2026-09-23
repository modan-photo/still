use serde::{Deserialize, Serialize};

pub const RENDER_SPEC_VERSION: u8 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderSpec {
    pub version: u8,
    pub source: SourceSpec,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub border: Option<BorderSpec>,
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BorderSpec {
    pub style: BorderStyle,
    pub width: f32,
    pub color: String,
    pub radius: f32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BorderStyle {
    Solid,
    Gradient,
    Shadow,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font: Option<FontSpec>,
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
    pub size: f32,
    pub weight: u16,
    pub italic: bool,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AdjustmentsSpec {
    pub exposure: f32,
    pub contrast: f32,
    pub saturation: f32,
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
    use super::{OutputFormat, OutputSpec, RenderSpec, SourceSpec, RENDER_SPEC_VERSION};

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
}
