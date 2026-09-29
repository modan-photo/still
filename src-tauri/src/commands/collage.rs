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
    task::run(
        window,
        state.inner().clone(),
        task_id,
        "collage_compose",
        move |token, report| compose_to_file(&items, &config, &token, report),
    )
    .await
}
