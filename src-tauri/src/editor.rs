use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::State;
use tokio::sync::Mutex;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorPreferences {
    pub theme: String,
    pub font_size: u32,
    pub font_family: String,
    pub line_height: f32,
    pub line_wrapping: bool,
    pub vim_mode: bool,
    pub autosave_interval: Option<u32>,
    pub show_line_numbers: bool,
    pub highlight_active_line: bool,
}

impl Default for EditorPreferences {
    fn default() -> Self {
        Self {
            theme: "default".to_string(),
            font_size: 14,
            font_family: "'SF Mono', Monaco, 'Cascadia Code', monospace".to_string(),
            line_height: 1.6,
            line_wrapping: true,
            vim_mode: false,
            autosave_interval: Some(30),
            show_line_numbers: true,
            highlight_active_line: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EditorState {
    pub current_file: Option<PathBuf>,
    pub content: String,
    pub cursor_position: usize,
    pub selection: Option<(usize, usize)>,
    pub history_index: usize,
    pub is_modified: bool,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            current_file: None,
            content: String::new(),
            cursor_position: 0,
            selection: None,
            history_index: 0,
            is_modified: false,
        }
    }
}

pub struct EditorManager {
    preferences: Mutex<EditorPreferences>,
    state: Mutex<EditorState>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Theme {
    pub id: String,
    pub name: String,
    pub theme_type: String,
    pub variables: HashMap<String, String>,
}

impl EditorManager {
    pub fn new() -> Self {
        Self {
            preferences: Mutex::new(EditorPreferences::default()),
            state: Mutex::new(EditorState::default()),
        }
    }

    pub async fn save_preferences(&self) -> Result<(), Box<dyn std::error::Error>> {
        let config_path = self.get_config_path()?;
        
        // Ensure the parent directory exists
        if let Some(parent) = config_path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        let prefs = self.preferences.lock().await;
        let content = serde_json::to_string_pretty(&*prefs)?;
        tokio::fs::write(config_path, content).await?;

        Ok(())
    }

    fn get_config_path(&self) -> Result<PathBuf, Box<dyn std::error::Error>> {
        // For now, use a simple local path - in production this should use proper app data directory
        let config_dir = std::env::current_dir()?.join(".gaimplan");
        std::fs::create_dir_all(&config_dir)?;
        Ok(config_dir.join("editor_preferences.json"))
    }

    fn get_themes_dir(&self) -> Result<PathBuf, Box<dyn std::error::Error>> {
        // For now, use a simple local path - in production this should use proper app data directory
        let config_dir = std::env::current_dir()?.join(".gaimplan");
        std::fs::create_dir_all(&config_dir)?;
        Ok(config_dir.join("themes"))
    }
}

// Tauri commands
#[tauri::command]
pub async fn save_editor_preference(
    key: String,
    value: String,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let manager = &state.editor;
    let mut prefs = manager.preferences.lock().await;
    
    match key.as_str() {
        "theme" => prefs.theme = value,
        "font_size" => prefs.font_size = value.parse().map_err(|e| format!("Invalid font size: {}", e))?,
        "font_family" => prefs.font_family = value,
        "line_height" => prefs.line_height = value.parse().map_err(|e| format!("Invalid line height: {}", e))?,
        "line_wrapping" => prefs.line_wrapping = value.parse().map_err(|e| format!("Invalid line wrapping: {}", e))?,
        "vim_mode" => prefs.vim_mode = value.parse().map_err(|e| format!("Invalid vim mode: {}", e))?,
        "autosave_interval" => {
            prefs.autosave_interval = if value.is_empty() {
                None
            } else {
                Some(value.parse().map_err(|e| format!("Invalid autosave interval: {}", e))?)
            };
        }
        "show_line_numbers" => prefs.show_line_numbers = value.parse().map_err(|e| format!("Invalid show line numbers: {}", e))?,
        "highlight_active_line" => prefs.highlight_active_line = value.parse().map_err(|e| format!("Invalid highlight active line: {}", e))?,
        _ => return Err(format!("Unknown preference key: {}", key)),
    }
    
    drop(prefs);
    manager.save_preferences().await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_editor_preferences(
    state: State<'_, crate::AppState>,
) -> Result<EditorPreferences, String> {
    let manager = &state.editor;
    Ok(manager.preferences.lock().await.clone())
}

#[tauri::command]
pub async fn list_theme_files(
    state: State<'_, crate::AppState>,
) -> Result<Vec<String>, String> {
    let manager = &state.editor;
    let themes_dir = manager.get_themes_dir().map_err(|e| e.to_string())?;

    if !themes_dir.exists() {
        return Ok(vec![]);
    }

    let mut themes = vec![];
    let mut entries = tokio::fs::read_dir(themes_dir).await.map_err(|e| e.to_string())?;
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        if let Some(name) = entry.file_name().to_str() {
            if name.ends_with(".json") {
                themes.push(name.to_string());
            }
        }
    }

    Ok(themes)
}

#[tauri::command]
pub async fn save_file(
    path: String,
    content: String,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let manager = &state.editor;
    let file_path = PathBuf::from(path);
    
    // Ensure the parent directory exists
    if let Some(parent) = file_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    
    tokio::fs::write(&file_path, content).await.map_err(|e| e.to_string())?;
    
    // Update editor state
    let mut state = manager.state.lock().await;
    state.current_file = Some(file_path);
    state.is_modified = false;
    
    Ok(())
}

#[tauri::command]
pub async fn read_file(
    path: String,
    state: State<'_, crate::AppState>,
) -> Result<String, String> {
    let manager = &state.editor;
    let file_path = PathBuf::from(&path);
    
    if !file_path.exists() {
        return Err("File does not exist".to_string());
    }
    
    let content = tokio::fs::read_to_string(&file_path).await.map_err(|e| e.to_string())?;
    
    // Update editor state
    let mut state = manager.state.lock().await;
    state.current_file = Some(file_path);
    state.content = content.clone();
    state.is_modified = false;
    
    Ok(content)
}

#[tauri::command]
pub async fn get_initial_file(
    state: State<'_, crate::AppState>,
) -> Result<Option<String>, String> {
    let manager = &state.editor;
    let state = manager.state.lock().await;
    Ok(state.current_file.as_ref().map(|p| p.to_string_lossy().to_string()))
}

// Wiki-link and markdown-specific commands
#[tauri::command]
pub async fn open_note(
    title: String,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let _manager = &state.editor;
    // For now, just log the request
    println!("Opening note: {}", title);
    
    // In a full implementation, this would:
    // 1. Search for the note file
    // 2. Create the note if it doesn't exist
    // 3. Open the note in the editor
    // 4. Update the navigation history
    
    Ok(())
}

#[tauri::command]
pub async fn search_by_tag(
    tag: String,
    state: State<'_, crate::AppState>,
) -> Result<Vec<String>, String> {
    let _manager = &state.editor;
    // For now, just log the request
    println!("Searching by tag: {}", tag);
    
    // In a full implementation, this would:
    // 1. Search through all markdown files
    // 2. Find files containing the tag
    // 3. Return the list of matching files
    
    Ok(vec![])
}

#[tauri::command]
pub async fn get_embedded_block(
    note_title: String,
    block_id: Option<String>,
    state: State<'_, crate::AppState>,
) -> Result<Option<String>, String> {
    let _manager = &state.editor;
    // For now, just log the request
    println!("Getting embedded block: {} {:?}", note_title, block_id);
    
    // In a full implementation, this would:
    // 1. Find the note file
    // 2. If block_id is provided, find the specific block
    // 3. Return the block content
    
    Ok(Some("Sample embedded content".to_string()))
}

#[tauri::command]
pub async fn create_theme_directory(
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let manager = &state.editor;
    let themes_dir = manager.get_themes_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(themes_dir).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_editor_state(
    cursor_position: usize,
    selection: Option<(usize, usize)>,
    is_modified: bool,
    state: State<'_, crate::AppState>,
) -> Result<(), String> {
    let manager = &state.editor;
    let mut state = manager.state.lock().await;
    state.cursor_position = cursor_position;
    state.selection = selection;
    state.is_modified = is_modified;
    Ok(())
}

#[tauri::command]
pub async fn get_editor_state(
    state: State<'_, crate::AppState>,
) -> Result<EditorState, String> {
    let manager = &state.editor;
    Ok(manager.state.lock().await.clone())
}