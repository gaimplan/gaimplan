use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use sha2::{Sha256, Digest};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VaultSettings {
    pub vault_path: String,
    pub editor: EditorSettings,
    pub files: FileSettings,
    pub last_modified: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorSettings {
    pub font_size: u32,
    pub font_family: String,
    pub theme: String,
    pub line_numbers: bool,
    pub line_wrapping: bool,
    pub show_status_bar: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileSettings {
    pub image_location: String,
    pub image_naming_pattern: String,
}

impl Default for VaultSettings {
    fn default() -> Self {
        VaultSettings {
            vault_path: String::new(),
            editor: EditorSettings::default(),
            files: FileSettings::default(),
            last_modified: chrono::Utc::now(),
        }
    }
}

impl Default for EditorSettings {
    fn default() -> Self {
        EditorSettings {
            font_size: 16,
            font_family: "'SF Mono', Monaco, 'Cascadia Code', monospace".to_string(),
            theme: "default".to_string(),
            line_numbers: true,
            line_wrapping: true,
            show_status_bar: true,
        }
    }
}

impl Default for FileSettings {
    fn default() -> Self {
        FileSettings {
            image_location: "files/".to_string(),
            image_naming_pattern: "Pasted image {timestamp}".to_string(),
        }
    }
}

// Generate a unique hash for the vault path
fn get_vault_hash(vault_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(vault_path.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)[..16].to_string() // Use first 16 chars of hash
}

// Get the store filename for a vault
fn get_store_filename(vault_path: &str) -> String {
    let hash = get_vault_hash(vault_path);
    format!("vault-settings-{}.json", hash)
}

#[tauri::command]
pub async fn get_vault_settings(app: AppHandle, vault_path: String) -> Result<VaultSettings, String> {
    println!("Loading vault settings for: {}", vault_path);
    
    let store_name = get_store_filename(&vault_path);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    if let Some(value) = store.get("settings") {
        let mut settings: VaultSettings = serde_json::from_value(value.clone())
            .map_err(|e| format!("Failed to parse settings: {}", e))?;
        
        // Update vault_path in case it has changed (vault moved)
        settings.vault_path = vault_path;
        
        Ok(settings)
    } else {
        println!("No settings found for vault, returning defaults");
        let mut settings = VaultSettings::default();
        settings.vault_path = vault_path;
        Ok(settings)
    }
}

// Input struct for save_vault_settings command (without last_modified)
#[derive(Debug, Serialize, Deserialize)]
pub struct VaultSettingsInput {
    pub vault_path: String,
    pub editor: EditorSettings,
    pub files: FileSettings,
}

#[tauri::command]
pub async fn save_vault_settings(app: AppHandle, settings: VaultSettingsInput) -> Result<(), String> {
    println!("Saving vault settings for: {}", settings.vault_path);
    
    // Create VaultSettings with current timestamp
    let vault_settings = VaultSettings {
        vault_path: settings.vault_path.clone(),
        editor: settings.editor,
        files: settings.files,
        last_modified: chrono::Utc::now(),
    };
    
    let store_name = get_store_filename(&settings.vault_path);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let value = serde_json::to_value(&vault_settings).map_err(|e| e.to_string())?;
    store.set("settings", value);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    println!("Vault settings saved successfully");
    Ok(())
}

#[tauri::command]
pub async fn reset_vault_settings(app: AppHandle, vault_path: String) -> Result<VaultSettings, String> {
    println!("Resetting vault settings to defaults for: {}", vault_path);
    
    let mut settings = VaultSettings::default();
    settings.vault_path = vault_path.clone();
    
    // Create input struct for save_vault_settings
    let input = VaultSettingsInput {
        vault_path: vault_path.clone(),
        editor: settings.editor.clone(),
        files: settings.files.clone(),
    };
    
    // Save the default settings
    save_vault_settings(app, input).await?;
    
    Ok(settings)
}

// Check if image location is valid within the vault
#[tauri::command]
pub async fn validate_image_location(vault_path: String, image_location: String) -> Result<bool, String> {
    let vault_path = Path::new(&vault_path);
    let image_path = vault_path.join(&image_location);
    
    // Ensure the path is within the vault
    match image_path.canonicalize() {
        Ok(canonical_path) => {
            match vault_path.canonicalize() {
                Ok(canonical_vault) => {
                    Ok(canonical_path.starts_with(&canonical_vault))
                }
                Err(_) => Ok(false)
            }
        }
        Err(_) => {
            // Path doesn't exist yet, but check if parent would be in vault
            if let Some(parent) = image_path.parent() {
                match parent.canonicalize() {
                    Ok(canonical_parent) => {
                        match vault_path.canonicalize() {
                            Ok(canonical_vault) => {
                                Ok(canonical_parent.starts_with(&canonical_vault))
                            }
                            Err(_) => Ok(false)
                        }
                    }
                    Err(_) => Ok(false)
                }
            } else {
                Ok(false)
            }
        }
    }
}

// Get all vault settings (for debugging/admin purposes)
#[tauri::command]
pub async fn list_all_vault_settings(app: AppHandle) -> Result<Vec<(String, VaultSettings)>, String> {
    println!("Listing all vault settings");
    
    let mut all_settings = Vec::new();
    
    // Note: In production, we'd need to track which vaults have settings
    // For now, this is mainly for debugging
    
    Ok(all_settings)
}