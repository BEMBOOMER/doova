//! Shared access to the folders Doova keeps beside its data file.
//!
//! The frontend only ever holds bare filenames, never paths. Turning one back
//! into a location on disk happens here and nowhere else, so the check that a
//! name cannot escape its folder exists once rather than in a copy per module,
//! where one copy would eventually be the one missing it.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;

use crate::datastore;

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Images and favicons travel with the data, so they hang off the same movable
/// folder rather than the app-data one.
pub fn subdir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = datastore::dir(app)?.join(name);
    std::fs::create_dir_all(&dir).map_err(|err| format!("Kon de map niet maken: {err}"))?;
    Ok(dir)
}

/// Rejects anything that is not a plain filename, so a crafted or corrupted
/// value cannot reach a file elsewhere on disk.
pub fn resolve(app: &AppHandle, dir: &str, file: &str) -> Result<PathBuf, String> {
    if file.is_empty() || file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }
    Ok(subdir(app, dir)?.join(file))
}

/// Time plus a counter: unique even when a dozen files land in the same
/// millisecond, and still roughly ordered on disk.
pub fn unique_name(ext: &str) -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}-{seq:x}.{ext}")
}

/// Deletes everything in `dir` that is not in `keep` and carries one of the
/// given extensions, so files this app never wrote are left alone.
pub fn sweep(
    app: &AppHandle,
    dir: &str,
    keep: &[String],
    extensions: &[&str],
) -> Result<usize, String> {
    let path = subdir(app, dir)?;
    let mut removed = 0;
    for entry in std::fs::read_dir(&path).map_err(|err| format!("Kon de map niet lezen: {err}"))? {
        let Ok(entry) = entry else { continue };
        let name = entry.file_name().to_string_lossy().to_string();
        if keep.iter().any(|k| k == &name) {
            continue;
        }
        let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
        if !ext.is_some_and(|e| extensions.contains(&e.as_str())) {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}
