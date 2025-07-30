use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;
use sha2::{Sha256, Digest};
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use base64::{Engine as _, engine::general_purpose};

// Provider enum to identify different AI providers
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AIProvider {
    OpenAI,
    Gemini,
    Ollama,
    LMStudio,
}

impl AIProvider {
    pub fn as_str(&self) -> &str {
        match self {
            AIProvider::OpenAI => "openai",
            AIProvider::Gemini => "gemini",
            AIProvider::Ollama => "ollama",
            AIProvider::LMStudio => "lmstudio",
        }
    }
    
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "openai" => Some(AIProvider::OpenAI),
            "gemini" => Some(AIProvider::Gemini),
            "ollama" => Some(AIProvider::Ollama),
            "lmstudio" => Some(AIProvider::LMStudio),
            _ => None,
        }
    }
    
    // Get default settings for a provider
    pub fn default_settings(&self) -> AISettings {
        match self {
            AIProvider::OpenAI => AISettings {
                provider: self.clone(),
                endpoint: "https://api.openai.com/v1".to_string(),
                api_key: None,
                model: "gpt-4".to_string(),
                temperature: 0.7,
                max_tokens: 4096,
                system_prompt: None,
                streaming_enabled: true,
                last_modified: chrono::Utc::now(),
            },
            AIProvider::Gemini => AISettings {
                provider: self.clone(),
                endpoint: "https://generativelanguage.googleapis.com/v1beta/openai".to_string(),
                api_key: None,
                model: "gemini-2.0-flash".to_string(),
                temperature: 0.7,
                max_tokens: 8192,
                system_prompt: None,
                streaming_enabled: true,
                last_modified: chrono::Utc::now(),
            },
            AIProvider::Ollama => AISettings {
                provider: self.clone(),
                endpoint: "http://localhost:11434/v1".to_string(),
                api_key: None,
                model: "llama3.2".to_string(),
                temperature: 0.7,
                max_tokens: 4096,
                system_prompt: None,
                streaming_enabled: true,
                last_modified: chrono::Utc::now(),
            },
            AIProvider::LMStudio => AISettings {
                provider: self.clone(),
                endpoint: "http://localhost:1234/v1".to_string(),
                api_key: None,
                model: "local-model".to_string(),
                temperature: 0.7,
                max_tokens: 4096,
                system_prompt: None,
                streaming_enabled: true,
                last_modified: chrono::Utc::now(),
            },
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AISettings {
    pub provider: AIProvider,
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub system_prompt: Option<String>,
    pub streaming_enabled: bool,
    pub last_modified: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredSettings {
    provider: AIProvider,
    endpoint: String,
    api_key_encrypted: Option<String>,
    model: String,
    temperature: f32,
    max_tokens: u32,
    system_prompt: Option<String>,
    streaming_enabled: bool,
    last_modified: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ActiveProvider {
    provider: AIProvider,
    last_switched: chrono::DateTime<chrono::Utc>,
}

// Derive a key from the app's unique identifier
fn derive_encryption_key(app: &AppHandle) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"gaimplan_ai_settings_v2"); // v2 for multi-provider
    hasher.update(app.config().product_name.as_ref().unwrap_or(&"gaimplan".to_string()).as_bytes());
    let result = hasher.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&result);
    key
}

// Encrypt a string using AES-256-GCM
fn encrypt_string(plaintext: &str, key: &[u8; 32]) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;
    
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption failed: {}", e))?;
    
    // Combine nonce and ciphertext
    let mut combined = Vec::new();
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    
    Ok(general_purpose::STANDARD.encode(&combined))
}

// Decrypt a string using AES-256-GCM
fn decrypt_string(encrypted: &str, key: &[u8; 32]) -> Result<String, String> {
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;
    
    if combined.len() < 12 {
        return Err("Invalid encrypted data".to_string());
    }
    
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Failed to create cipher: {}", e))?;
    
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed: {}", e))?;
    
    String::from_utf8(plaintext)
        .map_err(|e| format!("UTF-8 decode failed: {}", e))
}

// Get store filename for a provider
fn get_store_filename(provider: &AIProvider) -> String {
    format!("ai-settings-{}.json", provider.as_str())
}

#[tauri::command]
pub async fn save_ai_settings_for_provider(
    app: AppHandle,
    provider: String,
    settings: serde_json::Value,
) -> Result<(), String> {
    println!("Saving AI settings for provider: {}", provider);
    
    let provider_enum = AIProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    
    // Parse settings JSON into a mutable object
    let mut settings_obj = settings.as_object()
        .ok_or("Settings must be an object")?
        .clone();
    
    // Ensure required fields are present
    settings_obj.insert("provider".to_string(), serde_json::Value::String(provider_enum.as_str().to_string()));
    settings_obj.insert("last_modified".to_string(), serde_json::to_value(chrono::Utc::now()).unwrap());
    
    // Parse into AISettings struct
    let settings: AISettings = serde_json::from_value(serde_json::Value::Object(settings_obj))
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    // Get encryption key
    let key = derive_encryption_key(&app);
    
    // Encrypt API key if present
    let encrypted_api_key = if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            Some(encrypt_string(api_key, &key)?)
        } else {
            None
        }
    } else {
        None
    };
    
    // Create stored settings
    let stored = StoredSettings {
        provider: settings.provider.clone(),
        endpoint: settings.endpoint,
        api_key_encrypted: encrypted_api_key,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
        system_prompt: settings.system_prompt,
        streaming_enabled: settings.streaming_enabled,
        last_modified: settings.last_modified,
    };
    
    // Save to provider-specific store
    let store_name = get_store_filename(&provider_enum);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
    store.set("settings", value);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    println!("AI settings saved successfully for provider: {}", provider);
    Ok(())
}

#[tauri::command]
pub async fn get_ai_settings_for_provider(
    app: AppHandle,
    provider: String,
) -> Result<AISettings, String> {
    println!("Loading AI settings for provider: {}", provider);
    
    let provider_enum = AIProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    
    let store_name = get_store_filename(&provider_enum);
    let store = app.store(&store_name)
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    if let Some(value) = store.get("settings") {
        let stored: StoredSettings = serde_json::from_value(value.clone())
            .map_err(|e| format!("Failed to parse settings: {}", e))?;
        
        // Decrypt API key if present
        let key = derive_encryption_key(&app);
        let api_key = if let Some(encrypted) = &stored.api_key_encrypted {
            // Try to decrypt, but if it fails (e.g., due to key change), return None
            match decrypt_string(encrypted, &key) {
                Ok(decrypted) => Some(decrypted),
                Err(e) => {
                    println!("Warning: Failed to decrypt API key: {}. Returning empty.", e);
                    None
                }
            }
        } else {
            None
        };
        
        Ok(AISettings {
            provider: stored.provider,
            endpoint: stored.endpoint,
            api_key,
            model: stored.model,
            temperature: stored.temperature,
            max_tokens: stored.max_tokens,
            system_prompt: stored.system_prompt,
            streaming_enabled: stored.streaming_enabled,
            last_modified: stored.last_modified,
        })
    } else {
        println!("No settings found for provider {}, returning defaults", provider);
        Ok(provider_enum.default_settings())
    }
}

#[tauri::command]
pub async fn get_active_ai_provider(app: AppHandle) -> Result<AIProvider, String> {
    let store = app.store("ai-settings-active.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    if let Some(value) = store.get("active") {
        let active: ActiveProvider = serde_json::from_value(value.clone())
            .map_err(|e| format!("Failed to parse active provider: {}", e))?;
        Ok(active.provider)
    } else {
        // Default to OpenAI if no active provider set
        Ok(AIProvider::OpenAI)
    }
}

#[tauri::command]
pub async fn set_active_ai_provider(app: AppHandle, provider: String) -> Result<(), String> {
    println!("Setting active AI provider to: {}", provider);
    
    let provider_enum = AIProvider::from_str(&provider)
        .ok_or_else(|| format!("Unknown provider: {}", provider))?;
    
    let active = ActiveProvider {
        provider: provider_enum,
        last_switched: chrono::Utc::now(),
    };
    
    let store = app.store("ai-settings-active.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let value = serde_json::to_value(&active).map_err(|e| e.to_string())?;
    store.set("active", value);
    
    store.save()
        .map_err(|e| format!("Failed to persist active provider: {}", e))?;
    
    println!("Active AI provider set successfully");
    Ok(())
}

#[tauri::command]
pub async fn migrate_ai_settings(app: AppHandle) -> Result<bool, String> {
    println!("Checking for AI settings migration...");
    
    // Check if old settings exist
    let old_store = app.store("ai_settings.json")
        .map_err(|e| format!("Failed to access old store: {}", e))?;
    
    let Some(value) = old_store.get("settings") else {
        println!("No old settings to migrate");
        return Ok(false);
    };
    
    // Parse old settings
    #[derive(Deserialize)]
    struct OldStoredSettings {
        endpoint: String,
        api_key_encrypted: Option<String>,
        model: String,
        temperature: f32,
        max_tokens: u32,
    }
    
    let old_settings: OldStoredSettings = serde_json::from_value(value.clone())
        .map_err(|e| format!("Failed to parse old settings: {}", e))?;
    
    // Determine provider from endpoint
    let provider = if old_settings.endpoint.contains("openai.com") {
        AIProvider::OpenAI
    } else if old_settings.endpoint.contains("generativelanguage.googleapis.com") {
        AIProvider::Gemini
    } else if old_settings.endpoint.contains("localhost:11434") {
        AIProvider::Ollama
    } else if old_settings.endpoint.contains("localhost:1234") {
        AIProvider::LMStudio
    } else {
        // Default to OpenAI for unknown endpoints
        AIProvider::OpenAI
    };
    
    println!("Migrating settings to provider: {:?}", provider);
    
    // Create new settings
    let new_settings = StoredSettings {
        provider: provider.clone(),
        endpoint: old_settings.endpoint,
        api_key_encrypted: old_settings.api_key_encrypted,
        model: old_settings.model,
        temperature: old_settings.temperature,
        max_tokens: old_settings.max_tokens,
        system_prompt: None,
        streaming_enabled: true,
        last_modified: chrono::Utc::now(),
    };
    
    // Save to new provider-specific store
    let store_name = get_store_filename(&provider);
    let new_store = app.store(&store_name)
        .map_err(|e| format!("Failed to access new store: {}", e))?;
    
    let value = serde_json::to_value(&new_settings).map_err(|e| e.to_string())?;
    new_store.set("settings", value);
    new_store.save()
        .map_err(|e| format!("Failed to save migrated settings: {}", e))?;
    
    // Set as active provider
    set_active_ai_provider(app.clone(), provider.as_str().to_string()).await?;
    
    // Remove old settings
    old_store.delete("settings");
    old_store.save()
        .map_err(|e| format!("Failed to clean up old settings: {}", e))?;
    
    println!("AI settings migration completed successfully");
    Ok(true)
}

// Re-export test connection functionality from the old module
pub use crate::ai_settings::{test_ai_connection};

// Command wrapper functions
#[tauri::command]
pub async fn get_ai_settings(app: AppHandle) -> Result<Option<AISettings>, String> {
    // Get the active provider's settings
    let active_provider = get_active_ai_provider(app.clone()).await?;
    let settings = get_ai_settings_for_provider(app, active_provider.as_str().to_string()).await?;
    Ok(Some(settings))
}

#[tauri::command]
pub async fn save_ai_settings(app: AppHandle, settings: serde_json::Value) -> Result<(), String> {
    // Extract provider from settings
    let provider_str = settings.get("provider")
        .and_then(|p| p.as_str())
        .ok_or("Provider not specified in settings")?
        .to_string();
    
    // Save using the provider-specific function which handles missing fields
    save_ai_settings_for_provider(app.clone(), provider_str.clone(), settings).await?;
    set_active_ai_provider(app, provider_str).await?;
    Ok(())
}