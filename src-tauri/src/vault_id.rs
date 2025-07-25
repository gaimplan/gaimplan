use std::path::Path;
use sha2::{Sha256, Digest};

/// Generate a consistent vault ID from a vault path
/// This uses the folder name as the vault ID for better readability
/// Falls back to hash if the folder name is not valid
pub fn generate_vault_id(vault_path: &Path) -> String {
    // First try to use the folder name as vault_id
    if let Some(folder_name) = vault_path.file_name() {
        if let Some(name_str) = folder_name.to_str() {
            // Validate the folder name is suitable as an ID
            if is_valid_vault_id(name_str) {
                return name_str.to_string();
            }
        }
    }
    
    // Fall back to hash if folder name is not suitable
    generate_vault_id_hash(vault_path)
}

/// Generate a vault ID using SHA256 hash of the path
pub fn generate_vault_id_hash(vault_path: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(vault_path.to_string_lossy().as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result).chars().take(8).collect()
}

/// Check if a string is suitable as a vault ID
fn is_valid_vault_id(s: &str) -> bool {
    // Must be non-empty, start with letter/number, and contain only letters, numbers, hyphens, underscores
    !s.is_empty() 
        && s.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        && s.chars().next().map_or(false, |c| c.is_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_valid_vault_ids() {
        assert!(is_valid_vault_id("test-vault"));
        assert!(is_valid_vault_id("my_vault"));
        assert!(is_valid_vault_id("vault123"));
        assert!(is_valid_vault_id("123vault"));
        
        assert!(!is_valid_vault_id(""));
        assert!(!is_valid_vault_id("my vault")); // spaces not allowed
        assert!(!is_valid_vault_id("-vault")); // can't start with hyphen
        assert!(!is_valid_vault_id("vault/")); // no slashes
    }
    
    #[test]
    fn test_generate_vault_id() {
        let path = PathBuf::from("/Users/test/test-vault");
        assert_eq!(generate_vault_id(&path), "test-vault");
        
        let path = PathBuf::from("/Users/test/my vault"); // has space
        assert_eq!(generate_vault_id(&path).len(), 8); // falls back to hash
    }
}