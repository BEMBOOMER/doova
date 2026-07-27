//! Quick capture: a menu bar item and a system-wide hotkey that put a one-field
//! window in front of whatever you are doing.
//!
//! The window is created once and then only shown and hidden, because building a
//! webview takes long enough to be felt when the whole point is catching a
//! thought before it goes. It loads its own document (capture.html) rather than
//! the app, so it never starts a second projects store: it emits what you typed
//! and the main window remains the only thing that writes to disk.

use std::sync::Mutex;

use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const WINDOW_LABEL: &str = "capture";

/// Roughly Spotlight's proportions: wide enough for a sentence, short enough to
/// read as a box you are about to dismiss again.
const WIDTH: f64 = 460.0;
const HEIGHT: f64 = 172.0;

pub const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Shift+Space";

/// The accelerator currently registered, so rebinding can release the old one.
/// macOS refuses to register the same combination twice within one app.
pub struct Hotkey(pub Mutex<Option<String>>);

fn build_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(
        app,
        WINDOW_LABEL,
        WebviewUrl::App("capture.html".into()),
    )
    .title("Snel vastleggen")
    .inner_size(WIDTH, HEIGHT)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .visible_on_all_workspaces(true)
    // macOS shadows the whole window rect, not the rounded panel inside it, so
    // it lands as a dark edge next to the panel instead of under it
    .shadow(false)
    .visible(false)
    .center()
    .build()?;

    float_over_fullscreen(&window);

    // Losing focus means you went back to what you were doing, so the window
    // gets out of the way by itself rather than lingering over another app.
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
        }
    });

    Ok(window)
}

/// Makes the window ride along into another app's fullscreen Space.
///
/// always_on_top and visible_on_all_workspaces are not enough on their own: tao
/// only ever sets CanJoinAllSpaces, and a fullscreen Space is a managed Space
/// that hides every window without FullScreenAuxiliary no matter how high its
/// level. Without this the hotkey appears dead in exactly the situation quick
/// capture is for. The window level is left where tao put it (floating), since
/// anything higher blocks the macOS input methods.
fn float_over_fullscreen(window: &WebviewWindow) {
    let Ok(ptr) = window.ns_window() else { return };
    if ptr.is_null() {
        return;
    }
    let ns: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
    let behavior = ns.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary;
    ns.setCollectionBehavior(behavior);
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    match app.get_webview_window(WINDOW_LABEL) {
        Some(existing) => Some(existing),
        None => match build_window(app) {
            Ok(created) => Some(created),
            Err(err) => {
                eprintln!("quick capture window failed to build: {err}");
                None
            }
        },
    }
}

pub fn show(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    // Re-centering on every show keeps it in front of you on the screen you are
    // actually looking at, instead of wherever it was left on another display.
    let _ = win.center();
    let _ = win.show();
    let _ = win.set_focus();
}

fn toggle(app: &AppHandle) {
    let Some(win) = window(app) else { return };
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
    } else {
        show(app);
    }
}

/// macOS reports both press and release for one keystroke; without the filter
/// the window opens and closes again in the same breath.
fn bind(app: &AppHandle, accelerator: &str) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|_| format!("'{accelerator}' is geen geldige toetscombinatie."))?;

    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle(app);
            }
        })
        .map_err(|err| format!("Deze toetscombinatie kon niet worden geregistreerd: {err}"))
}

pub fn register_initial(app: &AppHandle) {
    if let Err(err) = bind(app, DEFAULT_HOTKEY) {
        eprintln!("quick capture hotkey: {err}");
        return;
    }
    if let Some(state) = app.try_state::<Hotkey>() {
        *state.0.lock().unwrap() = Some(DEFAULT_HOTKEY.to_string());
    }
}

/// Swaps the hotkey at runtime. The old one is released first, since macOS
/// returns an error when the same app registers a combination twice.
#[tauri::command]
pub fn set_capture_hotkey(app: AppHandle, accelerator: String) -> Result<(), String> {
    let state = app
        .try_state::<Hotkey>()
        .ok_or("Sneltoets-status ontbreekt.")?;
    let previous = state.0.lock().unwrap().clone();

    if previous.as_deref() == Some(accelerator.as_str()) {
        return Ok(());
    }
    if let Some(old) = &previous {
        if let Ok(parsed) = old.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(parsed);
        }
    }

    match bind(&app, &accelerator) {
        Ok(()) => {
            *state.0.lock().unwrap() = Some(accelerator);
            Ok(())
        }
        Err(err) => {
            // Put the working one back rather than leaving the user with none.
            if let Some(old) = previous {
                let _ = bind(&app, &old);
            }
            Err(err)
        }
    }
}

/// Called by the capture window itself; it has no window permissions of its own.
#[tauri::command]
pub fn capture_hide(app: AppHandle) {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        let _ = win.hide();
    }
}

fn open_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let capture_item = MenuItemBuilder::with_id("tray:capture", "Snel vastleggen").build(app)?;
    let open_item = MenuItemBuilder::with_id("tray:open", "Doova openen").build(app)?;
    // Not PredefinedMenuItem::quit: quitting has to go through the same
    // handshake as Cmd+Q, where the window flushes pending saves before the
    // process ends. A plain quit would drop up to the debounce interval.
    let quit_item = MenuItemBuilder::with_id("tray:quit", "Doova stoppen").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&capture_item)
        .item(&open_item)
        .separator()
        .item(&quit_item)
        .build()?;

    // A flat alpha glyph, not the app icon: macOS tints template images itself,
    // and a full-colour icon would come through as a black blob.
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

    TrayIconBuilder::with_id("doova")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Doova")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray:capture" => show(app),
            "tray:open" => open_main(app),
            "tray:quit" => {
                let _ = app.emit("exit-requested", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
