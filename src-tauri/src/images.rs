//! Owns the copies of moodboard images inside the app's data folder.
//!
//! The frontend only ever holds a bare filename. Everything that turns that into
//! a real path happens here, so a name coming back over IPC can never point
//! outside the images folder.

use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::Serialize;
use tauri::AppHandle;

use crate::appdirs;

/// What the webview can actually decode; anything else would import as a broken
/// tile, so it is refused at the door instead.
const IMAGE_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "bmp", "tif", "tiff", "svg",
];

/// Generous enough for a camera original, small enough that a stray drop of
/// something huge fails fast rather than filling the disk.
const MAX_BYTES: usize = 64 * 1024 * 1024;

const DIR: &str = "images";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedImage {
    file: String,
    name: String,
}

fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    appdirs::subdir(app, DIR)
}

fn extension_of(name: &str) -> Option<String> {
    let ext = name.rsplit_once('.')?.1.to_ascii_lowercase();
    IMAGE_EXTS.contains(&ext.as_str()).then_some(ext)
}

fn store(app: &AppHandle, bytes: &[u8], ext: &str, name: &str) -> Result<ImportedImage, String> {
    if bytes.is_empty() {
        return Err("Het bestand is leeg.".into());
    }
    if bytes.len() > MAX_BYTES {
        return Err("Deze afbeelding is groter dan 64 MB.".into());
    }
    let file = appdirs::unique_name(ext);
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
    let source = appdirs::resolve(&app, DIR, &file)?;
    let ext = extension_of(&file).ok_or("Onbekend bestandstype.")?;
    let copy = appdirs::unique_name(&ext);
    std::fs::copy(&source, images_dir(&app)?.join(&copy))
        .map_err(|err| format!("Kopiëren mislukt: {err}"))?;
    Ok(copy)
}

/// Removing an image or a whole board does not touch the disk, because both are
/// undoable and a restored board with blank tiles would be worse than a stale
/// file. Orphans are collected at startup instead, once undo history is gone.
#[tauri::command]
pub fn sweep_unused_images(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    appdirs::sweep(&app, DIR, &keep, IMAGE_EXTS)
}
