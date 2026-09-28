use crate::error::AppError;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, State, Window};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Default)]
pub struct TaskManager(Arc<Mutex<HashMap<String, (TaskProgress, CancellationToken)>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskProgress {
    pub task_id: String,
    pub operation: String,
    pub stage: String,
    pub progress: u8,
    pub status: String,
    pub error: Option<String>,
}

impl TaskManager {
    fn start(&self, id: &str, operation: &str) -> Result<CancellationToken, AppError> {
        let mut tasks = self
            .0
            .lock()
            .map_err(|_| AppError::InvalidInput("task registry unavailable".into()))?;
        if id.trim().is_empty() || tasks.contains_key(id) {
            return Err(AppError::InvalidInput(
                "taskId must be nonempty and unique among active tasks".into(),
            ));
        }
        let token = CancellationToken::new();
        tasks.insert(
            id.into(),
            (
                TaskProgress {
                    task_id: id.into(),
                    operation: operation.into(),
                    stage: "queued".into(),
                    progress: 0,
                    status: "running".into(),
                    error: None,
                },
                token.clone(),
            ),
        );
        Ok(token)
    }
    fn report(
        &self,
        window: &Window,
        id: &str,
        stage: &str,
        progress: u8,
        result: Option<&Result<(), String>>,
    ) {
        if let Ok(mut tasks) = self.0.lock() {
            if let Some((event, token)) = tasks.get_mut(id) {
                if result.is_some() {
                    event.stage = stage.into();
                    event.progress = event.progress.max(progress);
                } else if progress >= event.progress {
                    event.stage = stage.into();
                    event.progress = progress;
                }
                if let Some(result) = result {
                    event.status = match result {
                        Ok(()) => "completed",
                        Err(_) if token.is_cancelled() => "cancelled",
                        Err(_) => "failed",
                    }
                    .into();
                    event.error = result.as_ref().err().cloned();
                }
                let _ = window.emit("task://progress", event.clone());
            }
        }
    }
}

pub fn check(token: &CancellationToken) -> Result<(), AppError> {
    if token.is_cancelled() {
        Err(AppError::Cancelled)
    } else {
        Ok(())
    }
}

pub async fn run<T, F>(
    window: Window,
    manager: TaskManager,
    id: String,
    operation: &'static str,
    work: F,
) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce(CancellationToken, Arc<dyn Fn(&str, u8) + Send + Sync>) -> Result<T, AppError>
        + Send
        + 'static,
{
    let token = manager.start(&id, operation)?;
    manager.report(&window, &id, "queued", 0, None);
    let worker_manager = manager.clone();
    let worker_window = window.clone();
    let worker_id = id.clone();
    let result_token = token.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let report = Arc::new(move |stage: &str, progress: u8| {
            worker_manager.report(&worker_window, &worker_id, stage, progress, None)
        });
        check(&token)?;
        work(token, report)
    })
    .await
    .map_err(|error| AppError::InvalidInput(format!("worker failed: {error}")))
    .and_then(|value| value)
    .map_err(|error| {
        if result_token.is_cancelled() {
            AppError::Cancelled
        } else {
            error
        }
    });
    let terminal = result.as_ref().map(|_| ()).map_err(ToString::to_string);
    manager.report(
        &window,
        &id,
        "finished",
        if result.is_ok() { 100 } else { 0 },
        Some(&terminal),
    );
    if let Ok(mut tasks) = manager.0.lock() {
        tasks.remove(&id);
    }
    result
}

#[tauri::command]
pub fn task_cancel(task_id: String, state: State<'_, TaskManager>) -> Result<(), AppError> {
    let tasks = state
        .0
        .lock()
        .map_err(|_| AppError::InvalidInput("task registry unavailable".into()))?;
    let (_, token) = tasks
        .get(&task_id)
        .ok_or_else(|| AppError::InvalidInput("unknown active task".into()))?;
    token.cancel();
    Ok(())
}

#[tauri::command]
pub fn task_list(state: State<'_, TaskManager>) -> Result<Vec<TaskProgress>, AppError> {
    let tasks = state
        .0
        .lock()
        .map_err(|_| AppError::InvalidInput("task registry unavailable".into()))?;
    Ok(tasks
        .values()
        .map(|(progress, _)| progress.clone())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn active_ids_are_unique_and_cancellation_is_shared() {
        let manager = TaskManager::default();
        let token = manager.start("export-1", "export").unwrap();
        assert!(manager.start("export-1", "export").is_err());
        manager.0.lock().unwrap()["export-1"].1.cancel();
        assert!(matches!(check(&token), Err(AppError::Cancelled)));
    }
}
