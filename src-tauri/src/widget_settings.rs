use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use std::collections::HashMap;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetSettings {
    pub visible: bool,
    pub active_tab: String,
    pub width: u32,
    pub tab_settings: HashMap<String, serde_json::Value>,
}

impl Default for WidgetSettings {
    fn default() -> Self {
        Self {
            visible: false,
            active_tab: "toc".to_string(),
            width: 300,
            tab_settings: HashMap::new(),
        }
    }
}

fn get_store_filename(vault_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(vault_path.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    format!("{}_widget_settings.json", hash)
}

#[tauri::command]
pub async fn get_widget_settings(app: AppHandle, vault_path: String) -> Result<WidgetSettings, String> {
    println!("Loading widget settings for vault: {}", vault_path);
    
    let store_name = get_store_filename(&vault_path);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    // Try to get existing settings
    if let Some(settings) = store.get("widget_settings") {
        match serde_json::from_value::<WidgetSettings>(settings.clone()) {
            Ok(widget_settings) => {
                println!("Found existing widget settings");
                return Ok(widget_settings);
            }
            Err(e) => {
                println!("Failed to parse widget settings: {}", e);
            }
        }
    }
    
    // Return default settings
    println!("Using default widget settings");
    Ok(WidgetSettings::default())
}

#[tauri::command]
pub async fn save_widget_settings(
    app: AppHandle,
    vault_path: String,
    settings: WidgetSettings,
) -> Result<(), String> {
    println!("Saving widget settings for vault: {}", vault_path);
    
    let store_name = get_store_filename(&vault_path);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    // Save the settings
    let settings_value = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("widget_settings", settings_value);
    
    // Save to disk
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    println!("Widget settings saved successfully");
    Ok(())
}