//! Owns the copies of moodboard images inside the app's data folder.
//!
//! The frontend only ever holds a bare filename. Everything that turns that into
//! a real path happens here, so a name coming back over IPC can never point
//! outside the images folder.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager};

/// What the webview can actually decode; anything else would import as a broken
/// tile, so it is refused at the door instead.
const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg",
];

/// Generous enough for a camera original, small enough that a stray drop of
/// something huge fails fast rather than filling the disk.
const MAX_BYTES: usize = 64 * 1024 * 1024;

static COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    file: String,
    name: String,
}

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Kon de datamap niet vinden: {err}"))?
        .join("images");
    std::fs::create_dir_all(&dir).map_err(|err| format!("Kon de map niet maken: {err}"))?;
    Ok(dir)
}

fn extension_of(name: &str) -> Option<String> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    IMAGE_EXTS.contains(&ext.as_str()).then_some(ext)
}

/// Rejects anything that is not a plain filename, so a crafted or corrupted
/// value cannot reach a file elsewhere on disk.
fn resolve(app: &AppHandle, file: &str) -> Result<PathBuf, String> {
    if file.is_empty() || file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }
    Ok(images_dir(app)?.join(file))
}

/// Time plus a counter: unique even when a dozen images land in the same
/// millisecond, and still roughly ordered on disk.
fn unique_name(ext: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}-{seq:x}.{ext}")
}

fn store(app: &AppHandle, bytes: &[u8], ext: &str, name: &str) -> Result<ImportedImage, String> {
    if bytes.is_empty() {
        return Err("Het bestand is leeg.".into());
    }
    if bytes.len() > MAX_BYTES {
        return Err("Deze afbeelding is groter dan 64 MB.".into());
    }
    let file = unique_name(ext);
    std::fs::write(images_dir(app)?.join(&file), bytes)
        .map_err(|err| format!("Opslaan mislukt: {err}"))?;
    Ok(ImportedImage {
        file,
        name: name.to_string(),
    })
}

#[tauri::command]
pub fn import_image_file(app: AppHandle, path: String) -> Result<ImportedImage, String> {
    let name = path.rsplit('/').next().unwrap_or(&path).to_string();
    let ext = extension_of(&name).ok_or("Dit is geen afbeelding die Doova kan tonen.")?;
    let bytes = std::fs::read(&path).map_err(|err| format!("Kon het bestand niet lezen: {err}"))?;
    store(&app, &bytes, &ext, &name)
}

/// Used for pasted images, which have pixels but no file to copy.
#[tauri::command]
pub fn import_image_bytes(
    app: AppHandle,
    data: String,
    ext: String,
    name: String,
) -> Result<ImportedImage, String> {
    let ext = ext.to_ascii_lowercase();
    if !IMAGE_EXTS.contains(&ext.as_str()) {
        return Err("Dit is geen afbeelding die Doova kan tonen.".into());
    }
    let bytes = STANDARD
        .decode(data.as_bytes())
        .map_err(|err| format!("Kon het geplakte beeld niet lezen: {err}"))?;
    store(&app, &bytes, &ext, &name)
}

/// Duplicating a block must not make two blocks share one file, or removing an
/// image from either would blank it out in the other.
#[tauri::command]
pub fn copy_stored_image(app: AppHandle, file: String) -> Result<String, String> {
    let source = resolve(&app, &file)?;
    let ext = extension_of(&file).ok_or("Onbekend bestandstype.")?;
    let copy = unique_name(&ext);
    std::fs::copy(&source, images_dir(&app)?.join(&copy))
        .map_err(|err| format!("Kopiëren mislukt: {err}"))?;
    Ok(copy)
}

/// Removing an image or a whole board does not touch the disk, because both are
/// undoable and a restored board with blank tiles would be worse than a stale
/// file. Orphans are collected at startup instead, once undo history is gone.
#[tauri::command]
pub fn sweep_unused_images(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    let dir = images_dir(&app)?;
    let mut removed = 0;
    for entry in std::fs::read_dir(&dir).map_err(|err| format!("Kon de map niet lezen: {err}"))? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if keep.iter().any(|k| k == &name) {
            continue;
        }
        // Only files this module could have written are fair game.
        if extension_of(&name).is_none() {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}
