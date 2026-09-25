mod commands;
mod error;
mod image_io;
mod render;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::task::TaskManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::image::image_load,
            commands::image::image_export,
            commands::image::thumb_get,
            commands::image::image_apply_border,
            commands::image::image_apply_watermark,
            commands::watermark::watermark_fonts,
            commands::watermark::watermark_presets_list,
            commands::watermark::watermark_preset_save,
            commands::watermark::watermark_preset_delete,
            commands::task::task_cancel,
            commands::task::task_list,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
