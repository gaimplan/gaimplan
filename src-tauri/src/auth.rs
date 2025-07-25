// auth.rs - Authentication module for gaimplan

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc, Duration};
use sha2::{Sha256, Digest};
use rand::{thread_rng, Rng};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub username: String,
    pub password_hash: String,
    pub permissions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub username: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultPermission {
    pub path: String,
    pub access: Vec<String>, // ["read", "write"]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPermissions {
    pub vaults: Vec<VaultPermission>,
}

pub struct AuthManager {
    users: Arc<RwLock<HashMap<String, User>>>,
    sessions: Arc<RwLock<HashMap<String, Session>>>,
    vault_permissions: Arc<RwLock<HashMap<String, Vec<VaultPermission>>>>,
}

impl AuthManager {
    pub fn new() -> Self {
        let mut users = HashMap::new();
        
        // Add demo user for development
        users.insert(
            "demo".to_string(),
            User {
                username: "demo".to_string(),
                password_hash: hash_password("demo123"),
                permissions: vec!["read".to_string(), "write".to_string()],
            },
        );
        
        // Initialize with demo vault permissions
        let mut vault_permissions = HashMap::new();
        vault_permissions.insert(
            "demo".to_string(),
            vec![VaultPermission {
                path: "*".to_string(),
                access: vec!["read".to_string(), "write".to_string()],
            }],
        );
        
        AuthManager {
            users: Arc::new(RwLock::new(users)),
            sessions: Arc::new(RwLock::new(HashMap::new())),
            vault_permissions: Arc::new(RwLock::new(vault_permissions)),
        }
    }
    
    pub async fn authenticate(&self, username: &str, password: &str) -> Result<AuthResult, String> {
        println!("🔐 Authenticating user: {}", username);
        
        let users = self.users.read().await;
        
        if let Some(user) = users.get(username) {
            if verify_password(password, &user.password_hash) {
                // Generate session token
                let token = generate_token();
                let session = Session {
                    token: token.clone(),
                    username: username.to_string(),
                    created_at: Utc::now(),
                    expires_at: Utc::now() + Duration::hours(24),
                };
                
                // Store session
                let mut sessions = self.sessions.write().await;
                sessions.insert(token.clone(), session);
                
                println!("✅ Authentication successful for user: {}", username);
                
                Ok(AuthResult {
                    success: true,
                    token: Some(token),
                    permissions: Some(user.permissions.clone()),
                    message: None,
                })
            } else {
                println!("❌ Invalid password for user: {}", username);
                Ok(AuthResult {
                    success: false,
                    token: None,
                    permissions: None,
                    message: Some("Invalid password".to_string()),
                })
            }
        } else {
            println!("❌ User not found: {}", username);
            Ok(AuthResult {
                success: false,
                token: None,
                permissions: None,
                message: Some("User not found".to_string()),
            })
        }
    }
    
    pub async fn validate_session(&self, token: &str) -> ValidateResult {
        let sessions = self.sessions.read().await;
        
        if let Some(session) = sessions.get(token) {
            if session.expires_at > Utc::now() {
                ValidateResult { valid: true }
            } else {
                ValidateResult { valid: false }
            }
        } else {
            ValidateResult { valid: false }
        }
    }
    
    pub async fn logout(&self, token: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write().await;
        sessions.remove(token);
        println!("🚪 User logged out, session removed");
        Ok(())
    }
    
    pub async fn get_user_permissions(&self, username: &str) -> Result<UserPermissions, String> {
        let vault_perms = self.vault_permissions.read().await;
        
        if let Some(perms) = vault_perms.get(username) {
            Ok(UserPermissions {
                vaults: perms.clone(),
            })
        } else {
            Ok(UserPermissions { vaults: vec![] })
        }
    }
    
    pub async fn check_vault_access(&self, token: &str, vault_path: &str) -> bool {
        let sessions = self.sessions.read().await;
        
        if let Some(session) = sessions.get(token) {
            if session.expires_at <= Utc::now() {
                return false;
            }
            
            let vault_perms = self.vault_permissions.read().await;
            if let Some(user_perms) = vault_perms.get(&session.username) {
                for perm in user_perms {
                    if perm.path == "*" || perm.path == vault_path {
                        return perm.access.contains(&"read".to_string());
                    }
                }
            }
        }
        
        false
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResult {
    pub success: bool,
    pub token: Option<String>,
    pub permissions: Option<Vec<String>>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateResult {
    pub valid: bool,
}

// Helper functions
fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn verify_password(password: &str, hash: &str) -> bool {
    hash_password(password) == hash
}

fn generate_token() -> String {
    let mut rng = thread_rng();
    let token: String = (0..32)
        .map(|_| {
            let idx = rng.gen_range(0..62);
            let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            chars[idx] as char
        })
        .collect();
    token
}