use tauri::{State, AppHandle, Emitter};
use crate::AppState;
use crate::window_lifecycle::AppPersistenceState;
use crate::window_factory::WindowFactory;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

/// Get recent vaults list
#[tauri::command]
pub async fn get_recent_vaults_basic() -> Result<Vec<VaultInfo>, String> {
    let persistence = AppPersistenceState::load()
        .map_err(|e| format!("Failed to load recent vaults: {}", e))?;
    
    let vault_infos: Vec<VaultInfo> = persistence.recent_vaults
        .into_iter()
        .filter_map(|path| {
            let path_buf = std::path::PathBuf::from(&path);
            if path_buf.exists() && path_buf.is_dir() {
                Some(VaultInfo {
                    path: path.clone(),
                    name: path_buf.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("Untitled")
                        .to_string(),
                })
            } else {
                None
            }
        })
        .collect();
    
    Ok(vault_infos)
}

/// Create a new window for a vault
#[tauri::command]
pub async fn open_vault_in_new_window_basic(
    vault_path: String,
    app: AppHandle,
    _state: State<'_, AppState>
) -> Result<String, String> {
    // Use WindowFactory to create the window
    let factory = WindowFactory::new(app.clone());
    let window = factory.create_vault_window(&vault_path)?;
    let window_id = window.label().to_string();
    
    // Update recent vaults
    let mut persistence = AppPersistenceState::load().unwrap_or_default();
    persistence.add_recent_vault(vault_path.clone());
    let _ = persistence.save();
    
    Ok(window_id)
}

/// Manage vaults - placeholder for file dialog
#[tauri::command]
pub async fn manage_vaults_basic(_app: AppHandle) -> Result<Option<String>, String> {
    // File dialog functionality would go here
    // For now, return an error message
    Err("File dialog functionality not yet implemented".to_string())
}