#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{State, Window};

use crate::{
    commands::task::{self, TaskManager},
    error::AppError,
    render::collage::{compose_to_file, CollageConfig, CollageItem},
};

#[tauri::command]
pub async fn collage_compose(
    window: Window,
    state: State<'_, TaskManager>,
    task_id: String,
    items: Vec<CollageItem>,
    config: CollageConfig,
) -> Result<String, AppError> {
    #[cfg(target_os = "android")]
    let app = window.app_handle().clone();
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "collage_compose",
        move |token, report| {
            #[cfg(target_os = "android")]
            if crate::image_io::source::is_content_uri(std::path::Path::new(&config.output_path)) {
                if crate::image_io::source::is_registered(&config.output_path) {
                    return Err(AppError::InvalidInput(
                        "an export destination cannot replace its source image".into(),
                    ));
                }
                let destination = config.output_path.clone();
                let result = (|| {
                    let format = config.output_format.ok_or_else(|| {
                        AppError::InvalidInput(
                            "collage outputFormat is required for a document URI".into(),
                        )
                    })?;
                    let image =
                        crate::render::collage::compose(&items, &config, &token, report.clone())?;
                    report("encoding", 94);
                    let output = crate::render::spec::OutputSpec {
                        format,
                        quality: config.quality.clamp(1, 100),
                    };
                    let staged = crate::documents::stage_image(
                        &app,
                        &image::DynamicImage::ImageRgba8(image),
                        &output,
                        None,
                        false,
                        false,
                        &token,
                    )?;
                    crate::documents::write_created(&app, staged.path(), &destination, &token)
                })();
                return match result {
                    Ok(uri) => Ok(uri),
                    Err(error) => match crate::documents::delete(&app, &destination) {
                        Ok(()) => Err(error),
                        Err(cleanup) => Err(AppError::DocumentCleanupRequired {
                            uri: destination,
                            cause: error.to_string(),
                            cleanup: cleanup.to_string(),
                        }),
                    },
                };
            }
            compose_to_file(&items, &config, &token, report)
        },
    )
    .await
}
