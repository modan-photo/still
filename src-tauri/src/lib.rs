mod commands;
mod error;
mod image_io;
mod render;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(commands::task::TaskManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::exif::exif_read,
            commands::exif::exif_write,
            commands::image::image_load,
            commands::image::image_list_directory,
            commands::image::cache_invalidate,
            commands::image::image_export,
            commands::export::image_export_batch,
            commands::image::thumb_get,
            commands::image::image_apply_border,
            commands::image::image_apply_watermark,
            commands::collage::collage_compose,
            commands::watermark::watermark_fonts,
            commands::watermark::watermark_presets_list,
            commands::watermark::watermark_preset_save,
            commands::watermark::watermark_preset_delete,
            commands::frame::frame_presets_load,
            commands::frame::frame_presets_save,
            commands::task::task_cancel,
            commands::task::task_list,
            commands::ui::ui_state_load,
            commands::ui::ui_state_save,
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
