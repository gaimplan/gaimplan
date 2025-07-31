use tauri::{State, Window, AppHandle, Emitter};
use crate::refactored_app_state::RefactoredAppState;
use crate::window_lifecycle::AppPersistenceState;
use crate::window_factory::WindowFactory;
use std::path::PathBuf;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultInfo {
    pub path: String,
    pub name: String,
}

/// Open a vault in a specific window
#[tauri::command]
pub async fn open_vault_in_window(
    path: String,
    window: Window,
    state: State<'_, RefactoredAppState>
) -> Result<VaultInfo, String> {
    let window_id = window.label();
    
    let vault_path = PathBuf::from(&path);
    
    if !vault_path.exists() {
        return Err("Vault directory does not exist".to_string());
    }
    
    if !vault_path.is_dir() {
        return Err("Path is not a directory".to_string());
    }
    
    let vault_info = VaultInfo {
        path: path.clone(),
        name: vault_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Untitled")
            .to_string(),
    };
    
    // Register window with vault using the shared file watcher system
    state.register_window_vault(window_id, vault_path.clone()).await?;
    
    // Update window title
    window.set_title(&format!("{} - Gaimplan", vault_info.name))
        .map_err(|e| format!("Failed to set window title: {}", e))?;
    
    Ok(vault_info)
}

/// Get vault info for a specific window
#[tauri::command]
pub async fn get_vault_info_for_window(
    window: Window,
    state: State<'_, RefactoredAppState>
) -> Result<Option<VaultInfo>, String> {
    let window_id = window.label();
    
    if let Some(vault_path) = state.get_window_vault_path(window_id).await {
        Ok(Some(VaultInfo {
            path: vault_path.to_string_lossy().to_string(),
            name: vault_path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Untitled")
                .to_string(),
        }))
    } else {
        Ok(None)
    }
}

/// Create a new window for a vault
#[tauri::command]
pub async fn open_vault_in_new_window(
    vault_path: String,
    app: tauri::AppHandle,
    state: State<'_, RefactoredAppState>
) -> Result<String, String> {
    // Use WindowFactory to create the window
    let factory = WindowFactory::new(app.clone());
    let window = factory.create_vault_window(&vault_path)?;
    let window_id = window.label().to_string();
    
    // Register the window with the state
    state.register_window_with_id(window_id.clone(), app.clone()).await?;
    
    // Update recent vaults
    let mut persistence = AppPersistenceState::load().unwrap_or_default();
    persistence.add_recent_vault(vault_path.clone());
    let _ = persistence.save();
    
    // Emit event to frontend to initialize the vault
    window.emit("vault-init", &vault_path)
        .map_err(|e| format!("Failed to emit vault-init event: {}", e))?;
    
    Ok(window_id)
}

/// Get recent vaults list
#[tauri::command]
pub async fn get_recent_vaults() -> Result<Vec<VaultInfo>, String> {
    let persistence = AppPersistenceState::load()
        .map_err(|e| format!("Failed to load recent vaults: {}", e))?;
    
    let vault_infos: Vec<VaultInfo> = persistence.recent_vaults
        .into_iter()
        .filter_map(|path| {
            let path_buf = PathBuf::from(&path);
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

/// Manage vaults - opens system file dialog for vault selection
#[tauri::command]
pub async fn manage_vaults(_app: AppHandle) -> Result<Option<String>, String> {
    // File dialog functionality is not available in current Tauri version
    // This would require using rfd crate or native dialogs
    // For now, return an error message
    Err("File dialog functionality not yet implemented".to_string())
}

/// Handle window close event
#[tauri::command]
pub async fn on_window_closing(
    window: Window,
    state: State<'_, RefactoredAppState>
) -> Result<bool, String> {
    let window_id = window.label();
    state.on_window_close(window_id).await
}