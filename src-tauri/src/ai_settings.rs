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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AISettings {
    pub endpoint: String,
    pub api_key: Option<String>,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredSettings {
    endpoint: String,
    api_key_encrypted: Option<String>,
    model: String,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub endpoint_status: TestStatus,
    pub auth_status: TestStatus,
    pub model_status: TestStatus,
    pub overall_status: TestStatus,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestStatus {
    pub stage: String,
    pub success: bool,
    pub message: String,
}

// Derive a key from the app's unique identifier
fn derive_encryption_key(app: &AppHandle) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"gaimplan_ai_settings_v1");
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

// Old save function - kept for migration purposes
pub async fn save_ai_settings_old(
    app: AppHandle,
    settings: AISettings,
) -> Result<(), String> {
    println!("Saving AI settings...");
    
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
        endpoint: settings.endpoint,
        api_key_encrypted: encrypted_api_key,
        model: settings.model,
        temperature: settings.temperature,
        max_tokens: settings.max_tokens,
    };
    
    // Save to store
    let store = app.store("ai_settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let value = serde_json::to_value(&stored).map_err(|e| e.to_string())?;
    store.set("settings", value);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    println!("AI settings saved successfully");
    Ok(())
}

// Old get function - kept for migration purposes
pub async fn get_ai_settings_old(app: AppHandle) -> Result<Option<AISettings>, String> {
    println!("Loading AI settings...");
    
    let store = app.store("ai_settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let Some(value) = store.get("settings") else {
        println!("No AI settings found");
        return Ok(None);
    };
    
    let stored: StoredSettings = serde_json::from_value(value.clone())
        .map_err(|e| format!("Failed to parse settings: {}", e))?;
    
    // Decrypt API key if present
    let key = derive_encryption_key(&app);
    let api_key = if let Some(encrypted) = &stored.api_key_encrypted {
        Some(decrypt_string(encrypted, &key)?)
    } else {
        None
    };
    
    Ok(Some(AISettings {
        endpoint: stored.endpoint,
        api_key,
        model: stored.model,
        temperature: stored.temperature,
        max_tokens: stored.max_tokens,
    }))
}

#[tauri::command]
pub async fn test_ai_connection(settings: AISettings) -> Result<ConnectionTestResult, String> {
    println!("Testing AI connection to: {}", settings.endpoint);
    
    let mut result = ConnectionTestResult {
        endpoint_status: TestStatus {
            stage: "endpoint".to_string(),
            success: false,
            message: "Checking endpoint...".to_string(),
        },
        auth_status: TestStatus {
            stage: "auth".to_string(),
            success: false,
            message: "Not tested".to_string(),
        },
        model_status: TestStatus {
            stage: "model".to_string(),
            success: false,
            message: "Not tested".to_string(),
        },
        overall_status: TestStatus {
            stage: "overall".to_string(),
            success: false,
            message: "Testing...".to_string(),
        },
    };
    
    // Test 1: Check endpoint reachability
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    
    // For local endpoints, check if server is running
    if settings.endpoint.contains("localhost") || settings.endpoint.contains("127.0.0.1") {
        match client.get(&settings.endpoint).send().await {
            Ok(_) => {
                result.endpoint_status.success = true;
                result.endpoint_status.message = "Local server is running".to_string();
            }
            Err(e) => {
                result.endpoint_status.message = format!("Local server not accessible: {}", e);
                result.overall_status.message = "Failed to connect to local AI server".to_string();
                return Ok(result);
            }
        }
    } else {
        // For external endpoints, check HTTPS
        if !settings.endpoint.starts_with("https://") {
            result.endpoint_status.message = "External endpoints must use HTTPS".to_string();
            result.overall_status.message = "Security error: HTTPS required".to_string();
            return Ok(result);
        }
        result.endpoint_status.success = true;
        result.endpoint_status.message = "Endpoint URL is valid".to_string();
    }
    
    // Test 2: Check authentication (if API key provided)
    if let Some(api_key) = &settings.api_key {
        if !api_key.is_empty() {
            // Make a minimal request to test auth
            let test_url = format!("{}/chat/completions", settings.endpoint.trim_end_matches('/'));
            let test_body = serde_json::json!({
                "model": settings.model,
                "messages": [{"role": "user", "content": "Hi"}],
                "max_tokens": 1,
                "stream": false
            });
            
            match client
                .post(&test_url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&test_body)
                .send()
                .await
            {
                Ok(response) => {
                    if response.status() == 401 {
                        result.auth_status.message = "Invalid API key".to_string();
                        result.overall_status.message = "Authentication failed".to_string();
                        return Ok(result);
                    } else if response.status().is_success() || response.status() == 400 {
                        result.auth_status.success = true;
                        result.auth_status.message = "API key is valid".to_string();
                        result.model_status.success = true;
                        result.model_status.message = "Model is available".to_string();
                    }
                }
                Err(e) => {
                    result.auth_status.message = format!("Failed to test authentication: {}", e);
                }
            }
        } else {
            result.auth_status.success = true;
            result.auth_status.message = "No authentication required".to_string();
        }
    } else {
        result.auth_status.success = true;
        result.auth_status.message = "No authentication required".to_string();
    }
    
    // Set overall status
    if result.endpoint_status.success && result.auth_status.success {
        result.overall_status.success = true;
        result.overall_status.message = "Connection successful!".to_string();
    }
    
    Ok(result)
}