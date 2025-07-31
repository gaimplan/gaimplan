use tauri::{State, Window};
use crate::docker::SharedDockerManager;
use crate::graph::{GraphManager, Note, GraphManagerImpl};
use crate::{AppState, refactored_app_state::RefactoredAppState};
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Serialize, Deserialize};
use std::any::Any;

// Helper functions for getting graph statistics
async fn get_node_count(graph_manager: &Arc<dyn crate::graph::GraphManagerTrait>) -> Result<usize, String> {
    // For now, return a placeholder
    // In a real implementation, we'd query Neo4j
    Ok(25) // This should match what we see in Neo4j browser
}

async fn get_relationship_count(graph_manager: &Arc<dyn crate::graph::GraphManagerTrait>) -> Result<usize, String> {
    // For now, return a placeholder
    // In a real implementation, we'd query Neo4j
    Ok(0) // This will be updated when relationships are created
}

#[tauri::command]
pub async fn clear_graph_data(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<String, String> {
    println!("=== CLEARING GRAPH DATA ===");
    
    // Get current vault from window state
    let window_id = window.label();
    let vault_path = refactored_state.get_window_vault_path(&window_id).await
        .ok_or_else(|| "No vault is currently open".to_string())?;
    let vault_id = crate::vault_id::generate_vault_id(&vault_path);
    
    // Get the graph manager
    let graph_manager = state.graph_manager.lock().await;
    if let Some(manager) = graph_manager.as_ref() {
        // Get the underlying implementation
        if let Some(graph_impl) = manager.as_any().downcast_ref::<crate::graph::GraphManagerImpl>() {
            // Clear Neo4j data
            graph_impl.neo4j.clear_vault_data(&vault_id).await?;
            
            // Clear Qdrant data if connected
            if graph_impl.qdrant.is_connected().await {
                if let Err(e) = graph_impl.qdrant.clear_collection().await {
                    println!("Warning: Failed to clear Qdrant collection: {}", e);
                }
            }
            
            Ok(format!("Successfully cleared all graph data for vault: {}", vault_id))
        } else {
            Err("Failed to access graph manager implementation".to_string())
        }
    } else {
        Err("Graph manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn ensure_graph_services_running() -> Result<bool, String> {
    let docker_manager = SharedDockerManager::new();
    docker_manager.ensure_started().await?;
    Ok(true)
}

#[tauri::command]
pub async fn get_graph_services_status() -> Result<crate::docker::SharedDockerStatus, String> {
    let docker_manager = SharedDockerManager::new();
    docker_manager.get_status().await
}

#[tauri::command]
pub async fn sync_vault_to_graph(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
    app_handle: tauri::AppHandle,
    skip_relationships: Option<bool>,
) -> Result<String, String> {
    println!("=== GRAPH SYNC STARTED ===");
    
    use std::sync::Arc;
    
    // Get current vault from window state
    println!("Getting current vault from window...");
    let window_id = window.label();
    let vault_path = refactored_state.get_window_vault_path(&window_id).await
        .ok_or_else(|| {
            println!("Error: No vault is currently open for window {}", window_id);
            "No vault is currently open".to_string()
        })?;
    
    // Create vault object for compatibility
    let vault = crate::vault::Vault::new(vault_path.clone())
        .map_err(|e| format!("Failed to create vault: {}", e))?;
    let vault_arc = Arc::new(vault);
    let vault_name = vault_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default")
        .to_string();
    
    // Get Docker connection info first
    println!("Getting Docker connection info...");
    use crate::docker::shared::SharedDockerManager;
    let docker_manager = SharedDockerManager::new();
    let conn_info = docker_manager.get_connection_info(&vault_name).await
        .map_err(|e| {
            println!("Failed to get connection info: {}", e);
            format!("Failed to get connection info: {}", e)
        })?;
    
    // Create a new graph manager for this sync operation with app handle for embeddings
    println!("Creating graph manager with embedding support...");
    use crate::graph::GraphManagerImpl;
    let graph_manager: Arc<dyn crate::graph::GraphManagerTrait> = Arc::new(
        GraphManagerImpl::with_vault_and_app_handle(conn_info.vault_id.clone(), app_handle)
    );
    
    let config = crate::graph::GraphConfig {
        vault_id: conn_info.vault_id.clone(),
        vault_path: vault_arc.path().to_string_lossy().to_string(),
        neo4j_uri: conn_info.neo4j.uri.clone(),
        neo4j_user: conn_info.neo4j.username.clone(),
        neo4j_password: conn_info.neo4j.password.clone(),
        qdrant_url: conn_info.qdrant.rest_url.clone(),
    };
    
    println!("Connecting to graph databases...");
    graph_manager.connect(&config).await
        .map_err(|e| {
            println!("Failed to connect to graph databases: {}", e);
            format!("Failed to connect to graph databases: {}", e)
        })?;
    
    // Clone for statistics later
    let graph_manager_stats = graph_manager.clone();
    
    // Use simple sync instead
    println!("Running simple sync...");
    use crate::graph::simple_sync::sync_vault_simple;
    
    let skip_rels = skip_relationships.unwrap_or(false);
    if skip_rels {
        println!("Skipping relationship building for this sync");
    }
    
    let (file_count, relationship_count) = sync_vault_simple(
        vault_arc.path(),
        &graph_manager,
        &conn_info.vault_id,
        skip_rels
    ).await?;
    
    println!("Simple sync completed: {} files, {} relationships", file_count, relationship_count);
    
    let result = format!(
        "Vault synced successfully! Processed {} files and created {} relationships in knowledge graph.",
        file_count, relationship_count
    );
    
    println!("Sync completed: {}", result);
    
    Ok(result)
}

#[tauri::command]
pub async fn stop_graph_services() -> Result<(), String> {
    let docker_manager = SharedDockerManager::new();
    docker_manager.stop_containers().await
}

#[tauri::command]
pub async fn connect_to_graph(
    vault_id: String,
    graph_manager: State<'_, Arc<Mutex<Option<GraphManager>>>>,
) -> Result<(), String> {
    // Ensure services are running
    let docker_manager = SharedDockerManager::new();
    docker_manager.ensure_started().await?;
    
    // Create graph manager with vault context
    let manager = GraphManager::new(vault_id).await?;
    
    // Store in app state
    let mut state = graph_manager.lock().await;
    *state = Some(manager);
    
    Ok(())
}

#[tauri::command]
pub async fn create_note_in_graph(
    note: Note,
    graph_manager: State<'_, Arc<Mutex<Option<GraphManager>>>>,
) -> Result<String, String> {
    let state = graph_manager.lock().await;
    if let Some(manager) = state.as_ref() {
        manager.create_note(note).await
    } else {
        Err("Graph not connected".to_string())
    }
}


// New commands for Phase 1 implementation

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphSyncStatus {
    pub enabled: bool,
    pub last_sync: Option<String>,
    pub pending_updates: usize,
    pub sync_errors: usize,
}

#[tauri::command]
pub async fn graph_update_node(
    file_path: String,
    _content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Get vault path
    let vault_guard = state.vault.lock().await;
    let vault = vault_guard.as_ref()
        .ok_or_else(|| "No vault is currently open".to_string())?;
    let vault_path = vault.path().to_path_buf();
    drop(vault_guard);
    
    // Get graph manager
    let graph_lock = state.graph_manager.lock().await;
    if let Some(ref manager) = *graph_lock {
        let full_path = vault_path.join(&file_path);
        
        // Use the existing sync_single_file function
        crate::graph::sync::sync_single_file(
            &full_path,
            &vault_path,
            manager
        ).await?;
        
        Ok(())
    } else {
        Err("Graph manager not initialized".to_string())
    }
}

#[tauri::command]
pub async fn graph_sync_status(
    state: State<'_, AppState>,
) -> Result<GraphSyncStatus, String> {
    // Get graph manager status
    let graph_lock = state.graph_manager.lock().await;
    let is_connected = if let Some(ref manager) = *graph_lock {
        manager.is_connected().await
    } else {
        false
    };
    
    // Get update queue status
    let queue_lock = state.update_queue.lock().await;
    let pending_updates = if let Some(ref queue) = *queue_lock {
        queue.queue_size().await
    } else {
        0
    };
    
    // Return actual status with queue information
    Ok(GraphSyncStatus {
        enabled: is_connected,
        last_sync: None, // Could track this in the update queue
        pending_updates,
        sync_errors: 0, // Could track this in the update queue
    })
}

#[tauri::command]
pub async fn graph_enable_sync(
    enabled: bool,
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
) -> Result<(), String> {
    println!("🔄 graph_enable_sync called with: {}", enabled);
    
    if enabled {
        // Ensure services are running and connect
        println!("Ensuring graph services are running...");
        ensure_graph_services_running().await
            .map_err(|e| {
                println!("❌ Failed to ensure services: {}", e);
                e
            })?;
        
        // Get vault info from window state
        println!("Getting vault info from window...");
        let window_id = window.label();
        let vault_path = refactored_state.get_window_vault_path(&window_id).await
            .ok_or_else(|| {
                println!("❌ No vault is currently open for window {}", window_id);
                "No vault is currently open".to_string()
            })?;
        println!("Vault path: {:?}", vault_path);
        let vault_name = vault_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("default")
            .to_string();
        
        // Create new graph manager if needed or reconnect if disconnected
        let mut graph_lock = state.graph_manager.lock().await;
        
        // Check if we need to create or reconnect
        let needs_connection = if let Some(ref manager) = *graph_lock {
            let connected = manager.is_connected().await;
            println!("Graph manager exists, connected: {}", connected);
            !connected
        } else {
            println!("No graph manager exists, creating new one");
            true
        };
        
        if needs_connection {
            println!("Setting up graph connection...");
            
            // Get connection info first
            println!("Getting Docker connection info...");
            use crate::docker::SharedDockerManager;
            let docker_manager = SharedDockerManager::new();
            let conn_info = docker_manager.get_connection_info(&vault_name).await
                .map_err(|e| {
                    println!("❌ Failed to get connection info: {}", e);
                    format!("Failed to get connection info: {}", e)
                })?;
            
            // Create new manager if needed
            if graph_lock.is_none() {
                println!("Creating new graph manager...");
                use crate::graph::GraphManagerImpl;
                let manager: Arc<dyn crate::graph::GraphManagerTrait> = Arc::new(GraphManagerImpl::new(conn_info.vault_id.clone()));
                *graph_lock = Some(manager);
            }
            
            println!("Creating graph config...");
            let config = crate::graph::GraphConfig {
                vault_id: conn_info.vault_id.clone(),
                vault_path: vault_path.to_string_lossy().to_string(),
                neo4j_uri: conn_info.neo4j.uri.clone(),
                neo4j_user: conn_info.neo4j.username.clone(),
                neo4j_password: conn_info.neo4j.password.clone(),
                qdrant_url: conn_info.qdrant.rest_url.clone(),
            };
            
            // Connect the manager
            if let Some(ref manager) = *graph_lock {
                println!("Connecting to graph databases...");
                manager.connect(&config).await
                    .map_err(|e| {
                        println!("❌ Failed to connect to graph: {}", e);
                        format!("Failed to connect: {}", e)
                    })?;
                println!("✅ Graph sync enabled and connected");
                
                // Initialize update queue for batch processing
                use crate::graph::update_queue::{UpdateQueue, UpdateQueueConfig};
                let update_queue_config = UpdateQueueConfig::default();
                let new_update_queue = Arc::new(UpdateQueue::new(manager.clone(), update_queue_config));
                let mut queue_lock = state.update_queue.lock().await;
                *queue_lock = Some(new_update_queue);
                println!("📦 Initialized update queue for batch processing");
            }
        } else {
            println!("Graph manager already connected");
        }
    } else {
        // Disconnect graph manager
        let mut graph_lock = state.graph_manager.lock().await;
        if let Some(ref manager) = *graph_lock {
            manager.disconnect().await?;
        }
        *graph_lock = None;
        
        // Clear update queue
        let mut queue_lock = state.update_queue.lock().await;
        if let Some(ref queue) = *queue_lock {
            queue.clear().await;
        }
        *queue_lock = None;
        
        println!("🛑 Graph sync disabled");
    }
    
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub note: Note,
    pub score: f32,
}

#[tauri::command]
pub async fn search_notes_semantic(
    query: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    println!("[DEBUG] Semantic search for: {}", query);
    
    // Get graph manager
    let graph_lock = state.graph_manager.lock().await;
    let graph_manager = graph_lock.as_ref()
        .ok_or("Graph manager not initialized")?;
    
    // Check if embedding generator is available
    let embedding_generator = graph_manager.as_any()
        .downcast_ref::<crate::graph::GraphManagerImpl>()
        .ok_or("Graph manager is not the expected type")?
        .embedding_generator
        .as_ref()
        .ok_or("Embedding generator not initialized - OpenAI API key may not be configured")?;
    
    // Generate query embedding
    println!("[DEBUG] Generating embedding for query...");
    let query_embedding = embedding_generator
        .generate_embedding(&query)
        .await
        .map_err(|e| format!("Failed to generate query embedding: {}", e))?;
    
    // Search similar notes in Qdrant
    println!("[DEBUG] Searching for similar notes...");
    let similar_note_ids = graph_manager.as_any()
        .downcast_ref::<crate::graph::GraphManagerImpl>()
        .ok_or("Graph manager is not the expected type")?
        .qdrant
        .search_similar(query_embedding, limit)
        .await
        .map_err(|e| format!("Failed to search similar notes: {}", e))?;
    
    println!("[DEBUG] Found {} similar notes", similar_note_ids.len());
    
    // Fetch full note data from Neo4j
    let mut results = Vec::new();
    for (note_id, similarity_score) in similar_note_ids.iter() {
        match graph_manager.get_note(note_id).await {
            Ok(Some(note)) => {
                // Use the similarity score from Qdrant
                results.push(SearchResult { note, score: *similarity_score });
            }
            Ok(None) => {
                eprintln!("[WARN] Note {} found in Qdrant but not in Neo4j", note_id);
            }
            Err(e) => {
                eprintln!("[ERROR] Failed to fetch note {}: {}", note_id, e);
            }
        }
    }
    
    println!("[DEBUG] Returning {} search results", results.len());
    Ok(results)
}