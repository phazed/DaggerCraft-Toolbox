use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const DATA_DIRECTORY_NAME: &str = "DaggerCraft Toolbox";
const DATA_FILE_NAME: &str = "daggercraft-data.json";
const PREVIOUS_FILE_NAME: &str = "daggercraft-data.previous.json";
const TEMP_FILE_NAME: &str = "daggercraft-data.pending.json";
const BACKUP_DIRECTORY_NAME: &str = "Backups";
const BACKUP_INTERVAL: Duration = Duration::from_secs(30 * 60);
const MAX_BACKUPS: usize = 20;

struct StorageState {
    io_lock: Mutex<()>,
    startup_backup_complete: Mutex<bool>,
}

struct DataPaths {
    directory: PathBuf,
    data_file: PathBuf,
    previous_file: PathBuf,
    pending_file: PathBuf,
    backup_directory: PathBuf,
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn get_paths(app: &AppHandle) -> Result<DataPaths, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("Unable to locate the Documents folder: {error}"))?;
    let directory = documents.join(DATA_DIRECTORY_NAME);

    Ok(DataPaths {
        data_file: directory.join(DATA_FILE_NAME),
        previous_file: directory.join(PREVIOUS_FILE_NAME),
        pending_file: directory.join(TEMP_FILE_NAME),
        backup_directory: directory.join(BACKUP_DIRECTORY_NAME),
        directory,
    })
}

fn ensure_directories(paths: &DataPaths) -> Result<(), String> {
    fs::create_dir_all(&paths.directory)
        .map_err(|error| format!("Unable to create the data folder: {error}"))?;
    fs::create_dir_all(&paths.backup_directory)
        .map_err(|error| format!("Unable to create the backup folder: {error}"))
}

fn is_valid_bundle(value: &Value) -> bool {
    value
        .as_object()
        .and_then(|object| object.get("keys"))
        .is_some_and(Value::is_object)
}

fn read_valid_bundle(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    let value: Value = serde_json::from_slice(&bytes).ok()?;
    is_valid_bundle(&value).then_some(value)
}

fn bundle_modified_at(bundle: &Value) -> u64 {
    bundle
        .get("modifiedAt")
        .and_then(Value::as_u64)
        .unwrap_or_default()
}

fn published_default_bundle() -> Value {
    let published = include_str!("../../data/vrahune_database.json");
    serde_json::from_str::<Value>(published)
        .ok()
        .filter(is_valid_bundle)
        .unwrap_or_else(|| {
            json!({
                "schemaVersion": 1,
                "savedAt": Value::Null,
                "modifiedAt": 0,
                "keys": {}
            })
        })
}

fn backup_files(paths: &DataPaths) -> Vec<PathBuf> {
    let mut files = fs::read_dir(&paths.backup_directory)
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("daggercraft-data-") && name.ends_with(".json")
                })
        })
        .collect::<Vec<_>>();
    files.sort();
    files
}

fn prune_backups(paths: &DataPaths) {
    let files = backup_files(paths);
    let remove_count = files.len().saturating_sub(MAX_BACKUPS);
    for path in files.into_iter().take(remove_count) {
        let _ = fs::remove_file(path);
    }
}

fn create_backup_file(paths: &DataPaths) -> Result<PathBuf, String> {
    if !paths.data_file.exists() {
        return Err("No saved data exists yet.".to_string());
    }

    let backup_path = paths
        .backup_directory
        .join(format!("daggercraft-data-{}.json", now_millis()));
    fs::copy(&paths.data_file, &backup_path)
        .map_err(|error| format!("Unable to create a backup: {error}"))?;
    prune_backups(paths);
    Ok(backup_path)
}

fn most_recent_backup_age(paths: &DataPaths) -> Option<Duration> {
    let latest = backup_files(paths).pop()?;
    fs::metadata(latest).ok()?.modified().ok()?.elapsed().ok()
}

fn create_timed_backup_if_needed(paths: &DataPaths) {
    if !paths.data_file.exists() {
        return;
    }

    let should_create = most_recent_backup_age(paths)
        .map(|age| age >= BACKUP_INTERVAL)
        .unwrap_or(true);

    if should_create {
        let _ = create_backup_file(paths);
    }
}

fn write_bundle_safely(paths: &DataPaths, bundle: &Value) -> Result<(), String> {
    if !is_valid_bundle(bundle) {
        return Err("The toolbox refused to save invalid data.".to_string());
    }

    ensure_directories(paths)?;
    create_timed_backup_if_needed(paths);

    let serialized = serde_json::to_vec_pretty(bundle)
        .map_err(|error| format!("Unable to serialize toolbox data: {error}"))?;

    let mut pending = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&paths.pending_file)
        .map_err(|error| format!("Unable to open the pending save file: {error}"))?;
    pending
        .write_all(&serialized)
        .map_err(|error| format!("Unable to write toolbox data: {error}"))?;
    pending
        .sync_all()
        .map_err(|error| format!("Unable to finish writing toolbox data: {error}"))?;
    drop(pending);

    if paths.data_file.exists() {
        fs::copy(&paths.data_file, &paths.previous_file)
            .map_err(|error| format!("Unable to preserve the previous save: {error}"))?;
        fs::remove_file(&paths.data_file)
            .map_err(|error| format!("Unable to replace the previous save: {error}"))?;
    }

    if let Err(error) = fs::rename(&paths.pending_file, &paths.data_file) {
        if paths.previous_file.exists() && !paths.data_file.exists() {
            let _ = fs::copy(&paths.previous_file, &paths.data_file);
        }
        return Err(format!("Unable to activate the new save file: {error}"));
    }

    OpenOptions::new()
        .read(true)
        .write(true)
        .open(&paths.data_file)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("Unable to verify the saved data: {error}"))
}

fn recover_bundle(paths: &DataPaths) -> Option<Value> {
    let mut candidates = vec![
        paths.data_file.clone(),
        paths.pending_file.clone(),
        paths.previous_file.clone(),
    ];
    let mut backups = backup_files(paths);
    backups.reverse();
    candidates.extend(backups);

    let mut newest: Option<(PathBuf, Value, u64)> = None;
    for candidate in candidates {
        if let Some(bundle) = read_valid_bundle(&candidate) {
            let modified_at = bundle_modified_at(&bundle);
            if newest
                .as_ref()
                .is_none_or(|(_, _, newest_modified_at)| modified_at > *newest_modified_at)
            {
                newest = Some((candidate, bundle, modified_at));
            }
        }
    }

    let (source, bundle, _) = newest?;
    if source != paths.data_file {
        let _ = fs::copy(&source, &paths.data_file);
    }
    Some(bundle)
}

#[tauri::command]
fn load_toolbox_data(app: AppHandle, state: State<'_, StorageState>) -> Result<Value, String> {
    let _guard = state
        .io_lock
        .lock()
        .map_err(|_| "The save system lock is unavailable.".to_string())?;
    let paths = get_paths(&app)?;
    ensure_directories(&paths)?;

    let existing_bundle = recover_bundle(&paths);
    let bundle = existing_bundle
        .clone()
        .unwrap_or_else(published_default_bundle);

    if existing_bundle.is_none() {
        write_bundle_safely(&paths, &bundle)?;
    }

    let mut startup_backup_complete = state
        .startup_backup_complete
        .lock()
        .map_err(|_| "The backup system lock is unavailable.".to_string())?;
    if !*startup_backup_complete && paths.data_file.exists() {
        let _ = create_backup_file(&paths);
        *startup_backup_complete = true;
    }

    Ok(bundle)
}

#[tauri::command]
fn save_toolbox_data(
    app: AppHandle,
    state: State<'_, StorageState>,
    bundle: Value,
) -> Result<(), String> {
    let _guard = state
        .io_lock
        .lock()
        .map_err(|_| "The save system lock is unavailable.".to_string())?;
    let paths = get_paths(&app)?;
    write_bundle_safely(&paths, &bundle)
}

#[tauri::command]
fn create_manual_backup(app: AppHandle, state: State<'_, StorageState>) -> Result<String, String> {
    let _guard = state
        .io_lock
        .lock()
        .map_err(|_| "The save system lock is unavailable.".to_string())?;
    let paths = get_paths(&app)?;
    ensure_directories(&paths)?;
    create_backup_file(&paths).map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_data_directory(app: AppHandle) -> Result<String, String> {
    let paths = get_paths(&app)?;
    ensure_directories(&paths)?;
    Ok(paths.directory.to_string_lossy().to_string())
}

#[tauri::command]
fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let paths = get_paths(&app)?;
    ensure_directories(&paths)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(&paths.directory)
            .spawn()
            .map_err(|error| format!("Unable to open the data folder: {error}"))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = paths;
        return Err("Opening the data folder is currently supported on Windows.".to_string());
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(StorageState {
            io_lock: Mutex::new(()),
            startup_backup_complete: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            load_toolbox_data,
            save_toolbox_data,
            create_manual_backup,
            get_data_directory,
            open_data_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running DaggerCraft Toolbox");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_paths(name: &str) -> DataPaths {
        let directory =
            std::env::temp_dir().join(format!("daggercraft-storage-test-{name}-{}", now_millis()));
        DataPaths {
            data_file: directory.join(DATA_FILE_NAME),
            previous_file: directory.join(PREVIOUS_FILE_NAME),
            pending_file: directory.join(TEMP_FILE_NAME),
            backup_directory: directory.join(BACKUP_DIRECTORY_NAME),
            directory,
        }
    }

    fn bundle(value: &str) -> Value {
        json!({
            "schemaVersion": 1,
            "savedAt": "test",
            "modifiedAt": 1,
            "keys": { "example": value }
        })
    }

    #[test]
    fn safe_write_preserves_current_and_previous_data() {
        let paths = test_paths("previous");
        ensure_directories(&paths).unwrap();

        write_bundle_safely(&paths, &bundle("first")).unwrap();
        write_bundle_safely(&paths, &bundle("second")).unwrap();

        assert_eq!(read_valid_bundle(&paths.data_file), Some(bundle("second")));
        assert_eq!(
            read_valid_bundle(&paths.previous_file),
            Some(bundle("first"))
        );

        fs::remove_dir_all(&paths.directory).unwrap();
    }

    #[test]
    fn recovery_uses_pending_data_when_main_data_is_invalid() {
        let paths = test_paths("recovery");
        ensure_directories(&paths).unwrap();
        fs::write(&paths.data_file, b"not json").unwrap();
        fs::write(
            &paths.pending_file,
            serde_json::to_vec(&bundle("recovered")).unwrap(),
        )
        .unwrap();

        assert_eq!(recover_bundle(&paths), Some(bundle("recovered")));
        assert_eq!(
            read_valid_bundle(&paths.data_file),
            Some(bundle("recovered"))
        );

        fs::remove_dir_all(&paths.directory).unwrap();
    }

    #[test]
    fn recovery_prefers_a_newer_pending_save_over_a_valid_main_save() {
        let paths = test_paths("newer-pending");
        ensure_directories(&paths).unwrap();

        let mut older = bundle("older");
        older["modifiedAt"] = json!(10);
        let mut newer = bundle("newer");
        newer["modifiedAt"] = json!(20);

        fs::write(&paths.data_file, serde_json::to_vec(&older).unwrap()).unwrap();
        fs::write(&paths.pending_file, serde_json::to_vec(&newer).unwrap()).unwrap();

        assert_eq!(recover_bundle(&paths), Some(newer.clone()));
        assert_eq!(read_valid_bundle(&paths.data_file), Some(newer));

        fs::remove_dir_all(&paths.directory).unwrap();
    }
}
