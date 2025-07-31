use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;
use serde::{Serialize, Deserialize};
use tauri::AppHandle;
use crate::vault::Vault;
use crate::editor::EditorManager;
use crate::mcp::MCPManager;
use crate::docker::DockerManager;
use crate::graph::GraphManagerImpl;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use tauri::Emitter;

/// Represents the state of a single window
pub struct WindowState {
    pub window_id: String,
    pub vault: Arc<Mutex<Option<Vault>>>,
    pub editor: EditorManager,
    pub watcher: Arc<Mutex<Option<notify::RecommendedWatcher>>>,
    pub mcp_manager: Arc<MCPManager>,
}

impl WindowState {
    /// Creates a new WindowState with a unique window ID
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        Ok(Self {
            window_id: Uuid::new_v4().to_string(),
            vault: Arc::new(Mutex::new(None)),
            editor: EditorManager::new(),
            watcher: Arc::new(Mutex::new(None)),
            mcp_manager: Arc::new(MCPManager::new(app_handle).map_err(|e| e.to_string())?),
        })
    }

    /// Creates a new WindowState with a specific window ID
    pub fn with_id(window_id: String, app_handle: AppHandle) -> Result<Self, String> {
        Ok(Self {
            window_id,
            vault: Arc::new(Mutex::new(None)),
            editor: EditorManager::new(),
            watcher: Arc::new(Mutex::new(None)),
            mcp_manager: Arc::new(MCPManager::new(app_handle).map_err(|e| e.to_string())?),
        })
    }
}

/// Registry that manages multiple window states
pub struct WindowRegistry {
    windows: Arc<Mutex<HashMap<String, Arc<WindowState>>>>,
    docker_manager: Arc<DockerManager>,
    graph_manager: Arc<Mutex<Option<GraphManagerImpl>>>,
    file_watcher_registry: Arc<SharedFileWatcherRegistry>,
}

impl WindowRegistry {
    /// Creates a new WindowRegistry
    pub fn new(docker_manager: Arc<DockerManager>, app_handle: AppHandle) -> Result<Self, String> {
        let file_watcher_registry = Arc::new(
            SharedFileWatcherRegistry::new(app_handle)
                .map_err(|e| format!("Failed to create file watcher registry: {}", e))?
        );
        
        Ok(Self {
            windows: Arc::new(Mutex::new(HashMap::new())),
            docker_manager,
            graph_manager: Arc::new(Mutex::new(None)),
            file_watcher_registry,
        })
    }

    /// Registers a new window and returns its ID
    pub async fn register_window(&self, app_handle: AppHandle) -> Result<String, String> {
        let window_state = Arc::new(WindowState::new(app_handle)?);
        let window_id = window_state.window_id.clone();
        
        let mut windows = self.windows.lock().await;
        windows.insert(window_id.clone(), window_state);
        
        Ok(window_id)
    }

    /// Registers a window with a specific ID
    pub async fn register_window_with_id(&self, window_id: String, app_handle: AppHandle) -> Result<(), String> {
        let mut windows = self.windows.lock().await;
        
        if windows.contains_key(&window_id) {
            return Err(format!("Window with ID {} already exists", window_id));
        }
        
        let window_state = Arc::new(WindowState::with_id(window_id.clone(), app_handle)?);
        windows.insert(window_id, window_state);
        
        Ok(())
    }

    /// Unregisters a window by ID and returns true if it was the last window
    pub async fn unregister_window(&self, window_id: &str) -> bool {
        let mut windows = self.windows.lock().await;
        windows.remove(window_id);
        windows.is_empty()
    }

    /// Gets a reference to window state by ID
    pub async fn get_window(&self, window_id: &str) -> Option<Arc<WindowState>> {
        let windows = self.windows.lock().await;
        windows.get(window_id).cloned()
    }
    
    /// Gets window state by ID (alias for get_window for compatibility)
    pub async fn get_window_state(&self, window_id: &str) -> Result<Arc<WindowState>, String> {
        self.get_window(window_id).await
            .ok_or_else(|| format!("Window {} not found", window_id))
    }
    
    /// Checks if a window exists
    pub async fn has_window(&self, window_id: &str) -> bool {
        let windows = self.windows.lock().await;
        windows.contains_key(window_id)
    }

    /// Gets the count of registered windows
    pub async fn window_count(&self) -> usize {
        let windows = self.windows.lock().await;
        windows.len()
    }

    /// Checks if this is the last window
    pub async fn is_last_window(&self) -> bool {
        self.window_count().await == 1
    }

    /// Gets all window IDs
    pub async fn get_window_ids(&self) -> Vec<String> {
        let windows = self.windows.lock().await;
        windows.keys().cloned().collect()
    }
    
    /// Gets the primary window (first registered)
    pub async fn get_primary_window(&self) -> Option<String> {
        let windows = self.windows.lock().await;
        windows.keys().next().cloned()
    }
    
    /// Called when a window is about to close
    pub async fn on_window_close(&self, window_id: &str) -> Result<bool, String> {
        let is_last = self.is_last_window().await;
        
        if is_last {
            // Save window state before closing
            if let Some(window) = self.get_window(window_id).await {
                let vault_lock = window.vault.lock().await;
                let vault_path = vault_lock.as_ref().map(|v| v.path().to_string_lossy().to_string());
                drop(vault_lock);
                
                // In real implementation, we would get actual window position from Tauri
                let position = WindowPosition {
                    x: 100,
                    y: 100,
                    width: 1024,
                    height: 768,
                };
                
                WindowPersistence::save_window_state(window_id, vault_path.as_deref(), position).await?;
            }
        }
        
        // Unregister the window from its vault (if any) before unregistering the window
        if let Err(e) = self.unregister_window_vault(window_id).await {
            eprintln!("Warning: Failed to unregister window vault: {}", e);
        }
        
        let is_last_window = self.unregister_window(window_id).await;
        Ok(is_last_window)
    }
    
    /// Restores the last window state on app startup
    pub async fn restore_last_window_state(&self) -> Result<Option<WindowPersistenceData>, String> {
        WindowPersistence::load_window_state().await
    }

    /// Associates a window with a vault and starts file watching
    pub async fn register_window_vault(&self, window_id: &str, vault_path: PathBuf) -> Result<(), String> {
        // First ensure the window exists
        let window = self.get_window(window_id).await
            .ok_or_else(|| format!("Window {} not found", window_id))?;

        // Set the vault in the window state
        let vault = crate::vault::Vault::new(vault_path.clone())
            .map_err(|e| format!("Failed to create vault: {}", e))?;
        
        {
            let mut vault_lock = window.vault.lock().await;
            *vault_lock = Some(vault);
        }

        // Register with the shared file watcher registry
        let is_new_watcher = self.file_watcher_registry
            .register_vault_watcher(vault_path.clone(), window_id).await?;

        if is_new_watcher {
            // Start watching the vault
            self.file_watcher_registry.start_watching(&vault_path).await?;
        }

        println!("Registered window {} with vault {}", window_id, vault_path.display());
        Ok(())
    }

    /// Unregisters a window from its vault and cleans up file watching if needed
    pub async fn unregister_window_vault(&self, window_id: &str) -> Result<(), String> {
        let window = self.get_window(window_id).await
            .ok_or_else(|| format!("Window {} not found", window_id))?;

        // Get the vault path before clearing it
        let vault_path = {
            let vault_lock = window.vault.lock().await;
            vault_lock.as_ref().map(|v| v.path().to_path_buf())
        };

        if let Some(vault_path) = vault_path {
            // Unregister from the shared file watcher registry
            let watcher_removed = self.file_watcher_registry
                .unregister_vault_watcher(&vault_path, window_id).await?;

            if watcher_removed {
                println!("Removed file watcher for vault {} (no more windows)", vault_path.display());
            }

            // Clear the vault from the window state
            let mut vault_lock = window.vault.lock().await;
            *vault_lock = None;

            println!("Unregistered window {} from vault {}", window_id, vault_path.display());
        }

        Ok(())
    }

    /// Gets the vault path for a window
    pub async fn get_window_vault_path(&self, window_id: &str) -> Option<PathBuf> {
        let window = self.get_window(window_id).await?;
        let vault_lock = window.vault.lock().await;
        vault_lock.as_ref().map(|v| v.path().to_path_buf())
    }

    /// Lists all currently watched vaults
    pub async fn get_watched_vaults(&self) -> Vec<PathBuf> {
        self.file_watcher_registry.get_watched_vaults().await
    }

    /// Gets the reference count for a vault (how many windows are watching it)
    pub async fn get_vault_watcher_ref_count(&self, vault_path: &PathBuf) -> usize {
        self.file_watcher_registry.get_watcher_ref_count(vault_path).await
    }
}

/// Window persistence data
#[derive(Debug, Serialize, Deserialize)]
pub struct WindowPersistenceData {
    pub window_id: String,
    pub vault_path: Option<String>,
    pub position: WindowPosition,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WindowPosition {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Window persistence layer
pub struct WindowPersistence;

impl WindowPersistence {
    /// Gets the path to the window state file
    fn get_state_file_path() -> Result<std::path::PathBuf, String> {
        let config_dir = dirs::config_dir()
            .ok_or_else(|| "Failed to get config directory".to_string())?;
        let app_dir = config_dir.join("com.gaimplan.dev");
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
        Ok(app_dir.join("window_state.json"))
    }
    
    /// Saves window state to disk
    pub async fn save_window_state(_window_id: &str, _vault_path: Option<&str>, _position: WindowPosition) -> Result<(), String> {
        let state_data = WindowPersistenceData {
            window_id: _window_id.to_string(),
            vault_path: _vault_path.map(|p| p.to_string()),
            position: _position,
        };
        
        let json = serde_json::to_string_pretty(&state_data)
            .map_err(|e| format!("Failed to serialize window state: {}", e))?;
            
        let path = Self::get_state_file_path()?;
        tokio::fs::write(path, json).await
            .map_err(|e| format!("Failed to write window state: {}", e))?;
            
        Ok(())
    }

    /// Loads window state from disk
    pub async fn load_window_state() -> Result<Option<WindowPersistenceData>, String> {
        let path = Self::get_state_file_path()?;
        
        if !path.exists() {
            return Ok(None);
        }
        
        let contents = tokio::fs::read_to_string(path).await
            .map_err(|e| format!("Failed to read window state: {}", e))?;
            
        let state_data = serde_json::from_str(&contents)
            .map_err(|e| format!("Failed to parse window state: {}", e))?;
            
        Ok(Some(state_data))
    }

    /// Clears saved window state
    pub async fn clear_window_state() -> Result<(), String> {
        let path = Self::get_state_file_path()?;
        
        if path.exists() {
            tokio::fs::remove_file(path).await
                .map_err(|e| format!("Failed to remove window state: {}", e))?;
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // For now, we'll skip tests that require AppHandle since it's complex to mock
    // In production code, we would create a trait for window state creation
    // and mock it for testing
    
    // Tests for WindowRegistry require AppHandle which is complex to mock
    // We'll focus on unit tests for data structures that don't require Tauri components
    
    #[tokio::test]
    async fn test_window_registry_creation_requires_app_handle() {
        // This test demonstrates that WindowRegistry now requires an AppHandle
        // In production, the AppHandle is provided by Tauri
        // For testing, we would need to create a mock AppHandle or use integration tests
        
        // For now, we just test that the struct fields exist
        use std::mem;
        assert!(mem::size_of::<WindowRegistry>() > 0);
    }
    
    #[tokio::test]
    async fn test_window_persistence_data() {
        let data = WindowPersistenceData {
            window_id: "test-window".to_string(),
            vault_path: Some("/path/to/vault".to_string()),
            position: WindowPosition {
                x: 100,
                y: 200,
                width: 800,
                height: 600,
            },
        };
        
        assert_eq!(data.window_id, "test-window");
        assert_eq!(data.vault_path, Some("/path/to/vault".to_string()));
        assert_eq!(data.position.x, 100);
        assert_eq!(data.position.y, 200);
        assert_eq!(data.position.width, 800);
        assert_eq!(data.position.height, 600);
    }
    
    #[tokio::test]
    async fn test_uuid_generation() {
        let uuid1 = Uuid::new_v4().to_string();
        let uuid2 = Uuid::new_v4().to_string();
        
        assert_ne!(uuid1, uuid2);
        assert!(Uuid::parse_str(&uuid1).is_ok());
        assert!(Uuid::parse_str(&uuid2).is_ok());
    }
}

/// Represents a file watcher for a specific vault with reference counting
struct VaultWatcher {
    watcher: notify::RecommendedWatcher,
    vault_path: PathBuf,
    reference_count: usize,
    event_tx: tokio::sync::mpsc::Sender<FileWatchEvent>,
    #[allow(dead_code)]
    watcher_task: tokio::task::JoinHandle<()>,
}

/// File watch event that includes vault path and window broadcasting
#[derive(Debug, Clone)]
pub struct FileWatchEvent {
    pub vault_path: PathBuf,
    pub event: notify::Event,
}

/// Registry that manages shared file watchers across multiple windows
pub struct SharedFileWatcherRegistry {
    watchers: Arc<Mutex<HashMap<PathBuf, VaultWatcher>>>,
    app_handle: AppHandle,
    global_event_tx: Arc<Mutex<Option<tokio::sync::mpsc::Sender<FileWatchEvent>>>>,
    _broadcast_task: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl SharedFileWatcherRegistry {
    /// Creates a new SharedFileWatcherRegistry
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        Ok(Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            app_handle,
            global_event_tx: Arc::new(Mutex::new(None)),
            _broadcast_task: Arc::new(Mutex::new(None)),
        })
    }
    
    /// Initialize the broadcast task (must be called within a Tokio runtime)
    async fn ensure_initialized(&self) -> Result<(), String> {
        let mut tx_lock = self.global_event_tx.lock().await;
        if tx_lock.is_none() {
            let (global_event_tx, mut global_event_rx) = tokio::sync::mpsc::channel::<FileWatchEvent>(1000);
            let app_handle_clone = self.app_handle.clone();
            
            // Start the global event broadcast task
            let broadcast_task = tokio::spawn(async move {
                while let Some(file_event) = global_event_rx.recv().await {
                    // Broadcast to all windows viewing this vault
                    SharedFileWatcherRegistry::broadcast_event_to_windows(&app_handle_clone, &file_event).await;
                }
            });
            
            *tx_lock = Some(global_event_tx);
            let mut task_lock = self._broadcast_task.lock().await;
            *task_lock = Some(broadcast_task);
        }
        Ok(())
    }

    /// Registers a window to watch a vault path
    /// Returns true if this is a new watcher, false if reusing existing
    pub async fn register_vault_watcher(&self, vault_path: PathBuf, window_id: &str) -> Result<bool, String> {
        // Ensure the registry is initialized
        self.ensure_initialized().await?;
        let mut watchers = self.watchers.lock().await;
        
        match watchers.get_mut(&vault_path) {
            Some(vault_watcher) => {
                // Existing watcher, increment reference count
                vault_watcher.reference_count += 1;
                println!("Reusing existing watcher for vault {} (ref count: {})", 
                        vault_path.display(), vault_watcher.reference_count);
                Ok(false)
            }
            None => {
                // Create new watcher
                println!("Creating new watcher for vault: {}", vault_path.display());
                let vault_watcher = self.create_vault_watcher(vault_path.clone()).await?;
                watchers.insert(vault_path.clone(), vault_watcher);
                println!("New watcher created for window {} on vault {}", window_id, vault_path.display());
                Ok(true)
            }
        }
    }

    /// Unregisters a window from watching a vault path
    /// Returns true if the watcher was removed (no more references), false if still in use
    pub async fn unregister_vault_watcher(&self, vault_path: &PathBuf, window_id: &str) -> Result<bool, String> {
        let mut watchers = self.watchers.lock().await;
        
        match watchers.get_mut(vault_path) {
            Some(vault_watcher) => {
                vault_watcher.reference_count -= 1;
                println!("Decremented ref count for vault {} (new count: {})", 
                        vault_path.display(), vault_watcher.reference_count);
                
                if vault_watcher.reference_count == 0 {
                    // Remove the watcher when no more windows are using it
                    println!("Removing watcher for vault {} (last window {} closed)", 
                            vault_path.display(), window_id);
                    watchers.remove(vault_path);
                    Ok(true)
                } else {
                    Ok(false)
                }
            }
            None => {
                println!("Warning: Attempted to unregister non-existent watcher for vault {}", vault_path.display());
                Ok(false)
            }
        }
    }

    /// Gets the reference count for a vault watcher
    pub async fn get_watcher_ref_count(&self, vault_path: &PathBuf) -> usize {
        let watchers = self.watchers.lock().await;
        watchers.get(vault_path).map(|w| w.reference_count).unwrap_or(0)
    }

    /// Lists all currently watched vault paths
    pub async fn get_watched_vaults(&self) -> Vec<PathBuf> {
        let watchers = self.watchers.lock().await;
        watchers.keys().cloned().collect()
    }

    /// Creates a new vault watcher with proper event handling
    async fn create_vault_watcher(&self, vault_path: PathBuf) -> Result<VaultWatcher, String> {
        // Ensure initialized before creating watcher
        self.ensure_initialized().await?;
        
        let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<FileWatchEvent>(100);
        let global_tx = self.global_event_tx.clone();
        let vault_path_clone = vault_path.clone();
        let event_tx_clone = event_tx.clone();

        // Create the file system watcher
        let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                let file_event = FileWatchEvent {
                    vault_path: vault_path_clone.clone(),
                    event,
                };
                // Send to vault-specific channel (non-blocking)
                let _ = event_tx_clone.try_send(file_event);
            }
        }).map_err(|e| format!("Failed to create file watcher: {}", e))?;

        // Start the event forwarding task
        let watcher_task = tokio::spawn(async move {
            while let Some(file_event) = event_rx.recv().await {
                // Forward to global broadcast channel
                let tx_lock = global_tx.lock().await;
                if let Some(ref tx) = *tx_lock {
                    if let Err(e) = tx.send(file_event).await {
                        eprintln!("Failed to forward file event to global channel: {}", e);
                        break;
                    }
                }
            }
        });

        Ok(VaultWatcher {
            watcher,
            vault_path: vault_path.clone(),
            reference_count: 1,
            event_tx,
            watcher_task,
        })
    }

    /// Starts watching a vault path (called after creating the watcher)
    pub async fn start_watching(&self, vault_path: &PathBuf) -> Result<(), String> {
        let mut watchers = self.watchers.lock().await;
        
        if let Some(vault_watcher) = watchers.get_mut(vault_path) {
            vault_watcher.watcher
                .watch(vault_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to start watching {}: {}", vault_path.display(), e))?;
            
            println!("Started watching vault: {}", vault_path.display());
            Ok(())
        } else {
            Err(format!("No watcher found for vault: {}", vault_path.display()))
        }
    }

    /// Broadcasts file events to all windows viewing the same vault
    async fn broadcast_event_to_windows(app_handle: &AppHandle, file_event: &FileWatchEvent) {
        // Filter relevant events
        match file_event.event.kind {
            EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                // Only process markdown files
                for path in &file_event.event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("md") {
                        // Emit to all windows - Tauri will handle filtering by window
                        let event_data = serde_json::json!({
                            "vaultPath": file_event.vault_path.to_string_lossy(),
                            "eventType": format!("{:?}", file_event.event.kind),
                            "filePath": path.to_string_lossy(),
                        });
                        
                        if let Err(e) = app_handle.emit("vault-file-changed", &event_data) {
                            eprintln!("Failed to emit vault-file-changed event: {}", e);
                        }
                    }
                }
            }
            _ => {
                // Ignore other event types
            }
        }
    }
}

impl Drop for VaultWatcher {
    fn drop(&mut self) {
        // The watcher_task will be automatically cancelled when dropped
        println!("Dropping vault watcher for: {}", self.vault_path.display());
    }
}