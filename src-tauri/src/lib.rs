use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, RunEvent};

// Cmd+Q does not fire the window's close-requested event, so the frontend
// gets one "exit-requested" round-trip to flush pending saves before we
// let the exit proceed (it calls process::exit via the plugin).
static EXIT_FLUSH_STARTED: AtomicBool = AtomicBool::new(false);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
