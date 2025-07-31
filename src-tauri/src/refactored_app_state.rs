use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;
use crate::window_state::{WindowRegistry, WindowState};
use crate::docker::DockerManager;
use crate::graph::GraphManagerImpl;

/// Global application state that manages multiple windows
pub struct RefactoredAppState {
    pub window_registry: Arc<WindowRegistry>,
    pub docker_manager: Arc<DockerManager>,
    pub graph_manager: Arc<Mutex<Option<GraphManagerImpl>>>,
}

impl RefactoredAppState {
    /// Creates a new refactored app state
    pub fn new(docker_manager: Arc<DockerManager>, app_handle: AppHandle) -> Result<Self, String> {
        let window_registry = Arc::new(WindowRegistry::new(docker_manager.clone(), app_handle)?);
        
        Ok(Self {
            window_registry,
            docker_manager,
            graph_manager: Arc::new(Mutex::new(None)),
        })
    }
    
    /// Gets the window state for a specific window
    pub async fn get_window_state(&self, window_id: &str) -> Option<Arc<WindowState>> {
        self.window_registry.get_window(window_id).await
    }
    
    /// Registers a new window
    pub async fn register_window(&self, app_handle: AppHandle) -> Result<String, String> {
        self.window_registry.register_window(app_handle).await
    }
    
    /// Registers a window with a specific ID
    pub async fn register_window_with_id(&self, window_id: String, app_handle: AppHandle) -> Result<(), String> {
        self.window_registry.register_window_with_id(window_id, app_handle).await
    }
    
    /// Handles window close event
    pub async fn on_window_close(&self, window_id: &str) -> Result<bool, String> {
        self.window_registry.on_window_close(window_id).await
    }

    /// Associates a window with a vault and starts file watching
    pub async fn register_window_vault(&self, window_id: &str, vault_path: std::path::PathBuf) -> Result<(), String> {
        self.window_registry.register_window_vault(window_id, vault_path).await
    }

    /// Unregisters a window from its vault
    pub async fn unregister_window_vault(&self, window_id: &str) -> Result<(), String> {
        self.window_registry.unregister_window_vault(window_id).await
    }

    /// Gets the vault path for a window
    pub async fn get_window_vault_path(&self, window_id: &str) -> Option<std::path::PathBuf> {
        self.window_registry.get_window_vault_path(window_id).await
    }

    /// Lists all currently watched vaults
    pub async fn get_watched_vaults(&self) -> Vec<std::path::PathBuf> {
        self.window_registry.get_watched_vaults().await
    }

    /// Gets the reference count for a vault (how many windows are watching it)
    pub async fn get_vault_watcher_ref_count(&self, vault_path: &std::path::PathBuf) -> usize {
        self.window_registry.get_vault_watcher_ref_count(vault_path).await
    }
}

/// Helper function to extract window ID from Tauri commands
pub fn extract_window_id(window: &tauri::Window) -> String {
    window.label().to_string()
}

/// Macro to get window state from a command context
#[macro_export]
macro_rules! get_window_state {
    ($state:expr, $window:expr) => {{
        let window_id = $crate::refactored_app_state::extract_window_id($window);
        match $state.get_window_state(&window_id).await {
            Some(window_state) => window_state,
            None => return Err(format!("Window {} not found", window_id)),
        }
    }};
}