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

    #[error("resize error: {0}")]
    Resize(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("unsupported operation: {0}")]
    Unsupported(String),

    #[error("The file is in use and cannot be modified.")]
    FileBusy,

    #[error("The file is read-only and cannot be modified.")]
    FileReadOnly,

    #[error("task cancelled")]
    Cancelled,
}

impl AppError {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Io(_) => "io_error",
            Self::Image(_) => "image_error",
            Self::Exif(_) => "exif_error",
            Self::Resize(_) => "resize_error",
            Self::InvalidInput(_) => "invalid_input",
            Self::Unsupported(_) => "unsupported",
            Self::FileBusy => "file_busy",
            Self::FileReadOnly => "file_read_only",
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

    #[test]
    fn serializes_actionable_file_errors() {
        let busy = serde_json::to_value(AppError::FileBusy).expect("serialize busy error");
        let read_only =
            serde_json::to_value(AppError::FileReadOnly).expect("serialize read-only error");

        assert_eq!(busy["code"], "file_busy");
        assert_eq!(
            busy["message"],
            "The file is in use and cannot be modified."
        );
        assert_eq!(read_only["code"], "file_read_only");
        assert_eq!(
            read_only["message"],
            "The file is read-only and cannot be modified."
        );
    }
}
