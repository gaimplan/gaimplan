use tauri::State;
use crate::AppState;
use std::path::Path;
use sha2::{Sha256, Digest};

#[tauri::command]
pub async fn calculate_note_id(
    _state: State<'_, AppState>,
    file_path: String,
    vault_path: String,
    vault_id: String,
) -> Result<String, String> {
    // This must match the ID generation in src/graph/sync.rs
    let path = Path::new(&file_path);
    let vault_path = Path::new(&vault_path);
    
    // Get relative path
    let relative_path = path.strip_prefix(vault_path)
        .map_err(|_| "Failed to get relative path")?;
    
    // Generate ID using SHA256(vault_id + relative_path)
    let mut hasher = Sha256::new();
    hasher.update(vault_id.as_bytes());
    hasher.update(relative_path.to_string_lossy().as_bytes());
    let result = format!("{:x}", hasher.finalize());
    
    Ok(result)
}

#[tauri::command]
pub async fn get_vault_id(
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Get current vault
    let vault_guard = state.vault.lock().await;
    let vault = vault_guard.as_ref()
        .ok_or_else(|| "No vault is currently open".to_string())?;
    let vault_path = vault.path().to_path_buf();
    let vault_name = vault_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default")
        .to_string();
    drop(vault_guard);
    
    // Get connection info to get the vault_id that matches what's in the database
    use crate::docker::shared::SharedDockerManager;
    let docker_manager = SharedDockerManager::new();
    let conn_info = docker_manager.get_connection_info(&vault_name).await
        .map_err(|e| format!("Failed to get connection info: {}", e))?;
    
    Ok(conn_info.vault_id)
}