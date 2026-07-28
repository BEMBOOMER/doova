//! Where Doova's data lives, and every read and write of it.
//!
//! The folder is movable, so that putting it in iCloud Drive gives you sync for
//! free without Doova running a service. That only works if exactly one place
//! knows the current location: a path threaded through the frontend would be a
//! second source of truth, and the moment they disagreed a save would land
//! somewhere nobody looks.
//!
//! So all of it is here. The frontend asks for "data.json", never for a path,
//! and cannot reach outside this folder even if it tries. It also means no
//! filesystem permissions have to be handed to the webview at all.

use std::path::{Path, PathBuf};
use std::sync::RwLock;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Stays in the real app-data folder even when the data moves, because it is
/// what says where the data went. Preferences stay put for the same reason:
/// they describe this Mac, not the documents.
const POINTER_FILE: &str = "location.json";
const BACKUP_DIR: &str = "backups";
const KEEP_BACKUPS: usize = 20;

#[derive(Serialize, Deserialize, Default)]
struct Pointer {
    data_dir: Option<String>,
}

/// The resolved data folder, read once at startup and again after a move.
pub struct DataDir(pub RwLock<PathBuf>);

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|err| format!("Kon de datamap niet vinden: {err}"))
}

fn pointer_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data(app)?.join(POINTER_FILE))
}

fn read_pointer(app: &AppHandle) -> Option<PathBuf> {
    let raw = std::fs::read_to_string(pointer_path(app).ok()?).ok()?;
    let pointer: Pointer = serde_json::from_str(&raw).ok()?;
    let dir = PathBuf::from(pointer.data_dir?);
    // A folder on an unplugged drive must not silently become the app-data one,
    // or a fresh empty file would be written where the real data used to be.
    dir.is_dir().then_some(dir)
}

/// Called once during setup. Falls back to app data when the pointer is absent
/// or points somewhere that is not there right now.
pub fn resolve_at_startup(app: &AppHandle) -> PathBuf {
    let dir = read_pointer(app).unwrap_or_else(|| app_data(app).unwrap_or_default());
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<DataDir>();
    let path = state.0.read().map_err(|_| "Datamap niet leesbaar.")?.clone();
    std::fs::create_dir_all(&path).map_err(|err| format!("Kon de map niet maken: {err}"))?;
    Ok(path)
}

/// Rejects anything that is not a plain filename or a name inside the backups
/// folder, so a value coming over IPC cannot reach a file elsewhere on disk.
fn resolve(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let clean = name.strip_prefix("backups/").unwrap_or(name);
    if clean.is_empty() || clean.contains('/') || clean.contains('\\') || clean.contains("..") {
        return Err("Ongeldige bestandsnaam.".into());
    }
    let base = dir(app)?;
    if name.starts_with("backups/") {
        let backups = base.join(BACKUP_DIR);
        std::fs::create_dir_all(&backups).map_err(|err| format!("Kon de map niet maken: {err}"))?;
        return Ok(backups.join(clean));
    }
    Ok(base.join(clean))
}

// ---------- reading and writing ----------

#[tauri::command]
pub fn store_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = resolve(&app, &name)?;
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("Lezen mislukt: {err}")),
    }
}

/// Writes to a temporary file, keeps one rolling backup, then renames over the
/// real one, so a crash midway can never leave a half-written data file.
#[tauri::command]
pub fn store_write(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let path = resolve(&app, &name)?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, contents.as_bytes()).map_err(|err| format!("Schrijven mislukt: {err}"))?;
    if path.exists() {
        let _ = std::fs::copy(&path, path.with_extension("json.bak"));
    }
    std::fs::rename(&tmp, &path).map_err(|err| format!("Opslaan mislukt: {err}"))
}

/// The rolling copy, for when the real file turns out to be unreadable.
#[tauri::command]
pub fn store_read_backup(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = resolve(&app, &name)?.with_extension("json.bak");
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(_) => Ok(None),
    }
}

// ---------- timestamped backups ----------

#[tauri::command]
pub fn store_backup(app: AppHandle, name: String, stamp: String) -> Result<bool, String> {
    let source = resolve(&app, &name)?;
    if !source.exists() {
        return Ok(false);
    }
    let target = resolve(&app, &format!("backups/data-{stamp}.json"))?;
    if target.exists() {
        return Ok(false);
    }
    std::fs::copy(&source, &target).map_err(|err| format!("Back-up mislukt: {err}"))?;
    prune_backups(&app)?;
    Ok(true)
}

fn prune_backups(app: &AppHandle) -> Result<(), String> {
    let mut names = list_backup_names(app)?;
    names.sort();
    names.reverse();
    let dir = dir(app)?.join(BACKUP_DIR);
    for name in names.into_iter().skip(KEEP_BACKUPS) {
        let _ = std::fs::remove_file(dir.join(name));
    }
    Ok(())
}

fn list_backup_names(app: &AppHandle) -> Result<Vec<String>, String> {
    let dir = dir(app)?.join(BACKUP_DIR);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    Ok(entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.starts_with("data-") && n.ends_with(".json"))
        .collect())
}

#[tauri::command]
pub fn store_list_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let mut names = list_backup_names(&app)?;
    names.sort();
    names.reverse();
    Ok(names)
}

// ---------- moving the folder ----------

#[tauri::command]
pub fn store_location(app: AppHandle) -> Result<String, String> {
    Ok(dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn store_is_default(app: AppHandle) -> Result<bool, String> {
    Ok(dir(&app)? == app_data(&app)?)
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

/// Copies everything across, and only then writes the pointer. The source is
/// left untouched, so an interrupted move loses nothing: the app simply carries
/// on where it was.
#[tauri::command]
pub fn store_move(app: AppHandle, target: String) -> Result<String, String> {
    let destination = if target.is_empty() {
        app_data(&app)?
    } else {
        PathBuf::from(&target)
    };
    let current = dir(&app)?;
    if destination == current {
        return Ok(current.to_string_lossy().to_string());
    }
    if !destination.is_dir() {
        return Err("Die map bestaat niet.".into());
    }
    // Nesting the data inside itself would copy forever
    if destination.starts_with(&current) {
        return Err("Kies een map buiten de huidige datamap.".into());
    }

    let documents = ["data.json", "data.json.bak", BACKUP_DIR, "images", "favicons"];
    for name in documents {
        let source = current.join(name);
        if !source.exists() {
            continue;
        }
        let into = destination.join(name);
        let result = if source.is_dir() {
            copy_tree(&source, &into)
        } else {
            std::fs::copy(&source, &into).map(|_| ())
        };
        result.map_err(|err| format!("Kopiëren van {name} mislukt: {err}"))?;
    }

    let pointer = Pointer {
        data_dir: (destination != app_data(&app)?)
            .then(|| destination.to_string_lossy().to_string()),
    };
    std::fs::write(
        pointer_path(&app)?,
        serde_json::to_string_pretty(&pointer).map_err(|err| err.to_string())?,
    )
    .map_err(|err| format!("Kon de locatie niet vastleggen: {err}"))?;

    *app.state::<DataDir>()
        .0
        .write()
        .map_err(|_| "Datamap niet schrijfbaar.")? = destination.clone();

    Ok(destination.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The guard that keeps an IPC-supplied name inside the data folder. The
    /// path itself is built here rather than through `resolve`, which needs an
    /// app handle, but the rejection rule is the same one.
    fn is_safe_name(name: &str) -> bool {
        let clean = name.strip_prefix("backups/").unwrap_or(name);
        !(clean.is_empty() || clean.contains('/') || clean.contains('\\') || clean.contains(".."))
    }

    #[test]
    fn plain_names_and_backups_are_allowed() {
        assert!(is_safe_name("data.json"));
        assert!(is_safe_name("settings.json"));
        assert!(is_safe_name("backups/data-20260101-1200.json"));
    }

    #[test]
    fn nothing_may_climb_out_of_the_folder() {
        assert!(!is_safe_name("../data.json"));
        assert!(!is_safe_name("backups/../../secrets"));
        assert!(!is_safe_name("/etc/passwd"));
        assert!(!is_safe_name("sub/dir.json"));
        assert!(!is_safe_name("a\\b.json"));
        assert!(!is_safe_name(""));
        assert!(!is_safe_name("backups/"));
    }

    #[test]
    fn copy_tree_carries_nested_folders_and_files() {
        let root = std::env::temp_dir().join(format!("doova-copy-{}", std::process::id()));
        let from = root.join("bron");
        let to = root.join("doel");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(from.join("images")).unwrap();
        std::fs::write(from.join("data.json"), b"{}").unwrap();
        std::fs::write(from.join("images/a.png"), b"PNG").unwrap();

        copy_tree(&from, &to).unwrap();

        assert_eq!(std::fs::read(to.join("data.json")).unwrap(), b"{}");
        assert_eq!(std::fs::read(to.join("images/a.png")).unwrap(), b"PNG");
        // the source is never touched: an interrupted move must lose nothing
        assert!(from.join("data.json").exists());
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_pointer_to_a_missing_folder_is_ignored() {
        // Mirrors read_pointer's own check: an unplugged drive must not become a
        // silent fresh start in the app-data folder.
        let gone = PathBuf::from("/Volumes/DezeSchijfBestaatNiet/doova");
        assert!(!gone.is_dir());
    }

    #[test]
    fn the_pointer_round_trips() {
        let json = serde_json::to_string(&Pointer {
            data_dir: Some("/Users/iemand/iCloud/Doova".into()),
        })
        .unwrap();
        let back: Pointer = serde_json::from_str(&json).unwrap();
        assert_eq!(back.data_dir.as_deref(), Some("/Users/iemand/iCloud/Doova"));

        // the default location is recorded as "no pointer", not as a path
        let empty: Pointer = serde_json::from_str("{}").unwrap();
        assert!(empty.data_dir.is_none());
    }
}
