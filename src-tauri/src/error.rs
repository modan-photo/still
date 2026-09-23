use serde::ser::{Serialize, SerializeStruct, Serializer};
use thiserror::Error;

/// Stable error contract returned by every fallible Tauri command.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("image error: {0}")]
    Image(#[from] image::ImageError),

    #[error("metadata error: {0}")]
    Exif(#[from] exif::Error),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("unsupported operation: {0}")]
    Unsupported(String),

    #[error("task cancelled")]
    Cancelled,
}

impl AppError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Io(_) => "io_error",
            Self::Image(_) => "image_error",
            Self::Exif(_) => "exif_error",
            Self::InvalidInput(_) => "invalid_input",
            Self::Unsupported(_) => "unsupported",
            Self::Cancelled => "cancelled",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::AppError;

    #[test]
    fn serializes_a_stable_frontend_shape() {
        let value = serde_json::to_value(AppError::Cancelled).expect("serialize AppError");

        assert_eq!(value["code"], "cancelled");
        assert_eq!(value["message"], "task cancelled");
    }
}
