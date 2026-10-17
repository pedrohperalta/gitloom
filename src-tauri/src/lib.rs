mod git;
use std::sync::{Arc, Mutex};
#[derive(Default)]
struct Operations(Arc<Mutex<()>>);

#[tauri::command]
async fn repository(
    path: String,
    limit: usize,
    state: tauri::State<'_, Operations>,
) -> Result<git::Repository, String> {
    let lock = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Operação interrompida".to_string())?;
        git::repository(&path, limit)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn changes(
    path: String,
    revision: Option<String>,
    state: tauri::State<'_, Operations>,
) -> Result<Vec<git::FileChange>, String> {
    let lock = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Operação interrompida".to_string())?;
        git::changes(&path, revision.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn diff(
    path: String,
    file: String,
    staged: bool,
    revision: Option<String>,
    state: tauri::State<'_, Operations>,
) -> Result<String, String> {
    let lock = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Operação interrompida".to_string())?;
        git::diff(&path, &file, staged, revision.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn operate(
    path: String,
    action: git::Action,
    state: tauri::State<'_, Operations>,
) -> Result<String, String> {
    let lock = state.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = lock
            .lock()
            .map_err(|_| "Operação interrompida".to_string())?;
        git::operate(&path, action)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Operations::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![repository, changes, diff, operate])
        .run(tauri::generate_context!())
        .expect("Could not start Gitloom");
}
