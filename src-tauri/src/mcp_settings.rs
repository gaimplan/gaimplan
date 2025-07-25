use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPServerConfig {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub transport: MCPTransportConfig,
    pub capabilities: MCPCapabilities,
    pub permissions: MCPPermissions,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type")]
pub enum MCPTransportConfig {
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
        working_dir: Option<String>,
    },
    #[serde(rename = "http")]
    Http {
        url: String,
        headers: HashMap<String, String>,
    },
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPCapabilities {
    pub tools: bool,
    pub resources: bool,
    pub prompts: bool,
    pub sampling: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MCPPermissions {
    pub read: bool,
    pub write: bool,
    pub delete: bool,
    pub external_access: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MCPSettings {
    pub enabled: bool,
    pub servers: HashMap<String, MCPServerConfig>,
}

impl Default for MCPSettings {
    fn default() -> Self {
        MCPSettings {
            enabled: true,
            servers: HashMap::new(),
        }
    }
}

#[tauri::command]
pub async fn save_mcp_settings(
    app: AppHandle,
    settings: MCPSettings,
) -> Result<(), String> {
    println!("Saving MCP settings...");
    
    // Save to store
    let store = app.store("mcp_settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    store.set("settings", value);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    println!("MCP settings saved successfully");
    Ok(())
}

#[tauri::command]
pub async fn get_mcp_settings(app: AppHandle) -> Result<MCPSettings, String> {
    println!("Loading MCP settings...");
    
    let store = app.store("mcp_settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let Some(value) = store.get("settings") else {
        println!("No MCP settings found, returning defaults");
        return Ok(MCPSettings::default());
    };
    
    let settings: MCPSettings = serde_json::from_value(value.clone())
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    Ok(settings)
}

#[tauri::command]
pub async fn save_mcp_server_config(
    app: AppHandle,
    server_id: String,
    config: MCPServerConfig,
) -> Result<(), String> {
    println!("Saving MCP server config for: {}", server_id);
    
    // Load existing settings
    let mut settings = get_mcp_settings(app.clone()).await?;
    
    // Update or add server config
    settings.servers.insert(server_id, config);
    
    // Save back
    save_mcp_settings(app, settings).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_mcp_server_config(
    app: AppHandle,
    server_id: String,
) -> Result<(), String> {
    println!("Deleting MCP server config: {}", server_id);
    
    // Load existing settings
    let mut settings = get_mcp_settings(app.clone()).await?;
    
    // Remove server config
    settings.servers.remove(&server_id);
    
    // Save back
    save_mcp_settings(app, settings).await?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_mcp_server_config(
    app: AppHandle,
    server_id: String,
) -> Result<Option<MCPServerConfig>, String> {
    let settings = get_mcp_settings(app).await?;
    Ok(settings.servers.get(&server_id).cloned())
}

#[tauri::command]
pub async fn list_mcp_server_configs(
    app: AppHandle,
) -> Result<Vec<MCPServerConfig>, String> {
    let settings = get_mcp_settings(app).await?;
    Ok(settings.servers.into_values().collect())
}