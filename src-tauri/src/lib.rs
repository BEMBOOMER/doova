use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, RunEvent};

#[cfg(target_os = "macos")]
pub mod docexport;
#[cfg(target_os = "macos")]
mod speech;

// Cmd+Q does not fire the window's close-requested event, so the frontend
// gets one "exit-requested" round-trip to flush pending saves before we
// let the exit proceed (it calls process::exit via the plugin).
static EXIT_FLUSH_STARTED: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        speech::speech_permissions,
        speech::speech_request_permissions,
        speech::speech_supported_locales,
        speech::speech_start,
        speech::speech_stop,
        docexport::export_document,
    ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() && !EXIT_FLUSH_STARTED.swap(true, Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("exit-requested", ());
                }
            }
        });
}
