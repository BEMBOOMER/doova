use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg(target_os = "macos")]
mod capture;
#[cfg(target_os = "macos")]
pub mod docexport;
mod images;
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
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Quick capture is always centred on demand; remembering where
                // it last sat would put it on a screen you have since left.
                .with_denylist(&["capture"])
                .build(),
        );

    #[cfg(target_os = "macos")]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(capture::Hotkey(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            capture::register_initial(&handle);
            if let Err(err) = capture::build_tray(&handle) {
                eprintln!("tray failed to build: {err}");
            }

            // Closing the main window hides it rather than destroying it. That
            // window owns the only projects store and the exit-flush listener,
            // so tearing it down while the app lives on in the menu bar would
            // leave nothing to save your work or answer the quit handshake.
            if let Some(main) = app.get_webview_window("main") {
                let hidden = main.clone();
                main.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hidden.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            images::import_image_file,
            images::import_image_bytes,
            images::copy_stored_image,
            images::sweep_unused_images,
            speech::speech_permissions,
            speech::speech_request_permissions,
            speech::speech_supported_locales,
            speech::speech_start,
            speech::speech_stop,
            docexport::export_document,
            capture::set_capture_hotkey,
            capture::capture_hide,
        ]);

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match &event {
            RunEvent::ExitRequested { api, code, .. } => {
                if code.is_none() && !EXIT_FLUSH_STARTED.swap(true, Ordering::SeqCst) {
                    api.prevent_exit();
                    let _ = app.emit("exit-requested", ());
                }
            }
            // Clicking the Dock icon after the window was closed to the menu bar.
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
            }
            _ => {}
        });
}
