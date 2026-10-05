mod commands;
mod documents;
mod error;
mod image_io;
mod render;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::task::TaskManager::default())
        .invoke_handler(tauri::generate_handler![
            documents::document_pick_directory,
            commands::exif::exif_read,
            commands::exif::exif_write,
            commands::image::image_load,
            commands::image::image_list_directory,
            commands::image::cache_invalidate,
            commands::image::image_export,
            commands::export::image_export_batch,
            commands::image::thumb_get,
            commands::collage::collage_compose,
            commands::watermark::watermark_fonts,
            commands::watermark::watermark_presets_list,
            commands::watermark::watermark_preset_save,
            commands::watermark::watermark_preset_delete,
            commands::frame::frame_presets_load,
            commands::frame::frame_presets_save,
            commands::task::task_cancel,
            commands::task::task_cancel_all,
            commands::task::task_list,
            commands::session::cleanup_legacy_session_files,
            commands::preferences::migrate_preferences_if_needed,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(documents::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                image_io::source::cleanup_previous_session(&app.path().app_cache_dir()?)?;
                documents::cleanup_staged(&app.path().app_cache_dir()?)?;
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
