// Re-export modules needed by the test binary
pub mod vault;
pub mod vault_id;
pub mod graph;
pub mod docker;
pub mod ai_settings;
pub mod ai_settings_multi;
pub mod app_state;
pub mod editor;
pub mod mcp;
pub mod window_state;
pub mod refactored_app_state;
pub mod window_commands;
pub mod window_factory;
pub mod window_lifecycle;
pub mod window_commands_basic;

pub use app_state::AppState;
pub use window_state::{WindowState, WindowRegistry};
pub use refactored_app_state::RefactoredAppState;