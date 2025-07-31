use tauri::{State, Window};
use crate::{AppState, refactored_app_state::RefactoredAppState};
use crate::search::{HybridSearchManager, HybridSearchResult, SearchQuery};
use std::sync::Arc;
use tokio::sync::Mutex;

#[tauri::command]
pub async fn hybrid_search(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
    query: SearchQuery,
) -> Result<Vec<HybridSearchResult>, String> {
    // Get current vault path from window state
    let window_id = window.label();
    let vault_path = refactored_state.get_window_vault_path(&window_id).await
        .ok_or_else(|| "No vault is currently open".to_string())?;
    let vault_name = vault_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default")
        .to_string();

    // Get connection info to get the vault_id that matches what's in the database
    use crate::docker::shared::SharedDockerManager;
    let docker_manager = SharedDockerManager::new();
    let conn_info = docker_manager.get_connection_info(&vault_name).await
        .map_err(|e| format!("Failed to get connection info: {}", e))?;

    // Create hybrid search manager with the correct vault_id
    let search_manager = HybridSearchManager::new(
        state.graph_manager.clone(),
        state.mcp_manager.clone(),
        vault_path,
        conn_info.vault_id,
    );

    // Execute search
    search_manager.search(query).await
}

#[tauri::command]
pub async fn search_with_mode(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
    query: String,
    mode: String,
    max_results: Option<usize>,
) -> Result<Vec<HybridSearchResult>, String> {
    use crate::search::types::{SearchMode, SearchOptions, SearchFilters};
    
    // Parse mode
    let search_mode = match mode.as_str() {
        "semantic" => SearchMode::Semantic,
        "graph" => SearchMode::Graph,
        "hybrid" => SearchMode::Hybrid,
        _ => SearchMode::Keyword,
    };

    // Build search query
    let search_query = SearchQuery {
        query,
        mode: search_mode,
        filters: SearchFilters::default(),
        options: SearchOptions {
            max_results: max_results.unwrap_or(20),
            ..Default::default()
        },
    };

    hybrid_search(window, state, refactored_state, search_query).await
}

#[tauri::command]
pub async fn get_search_capabilities(
    _state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use serde_json::json;
    
    // Return capabilities info for the frontend
    Ok(json!({
        "graph": true,  // Neo4j graph search is available from backend
        "keyword": true,  // Keyword search is available from backend
        "semantic": false,  // Semantic search should be handled by frontend MCP
        "hybrid": "partial",  // Hybrid mode only runs graph search from backend
        "semantic_handler": "frontend_mcp",  // Indicates frontend should use MCP for semantic
        "mcp_server": "gaimplan-qdrant"  // The MCP server to use for semantic search
    }))
}

#[tauri::command]
pub async fn resolve_node_id_to_path(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
    node_id: String,
) -> Result<Option<String>, String> {
    // Get graph manager
    let graph_lock = state.graph_manager.lock().await;
    let graph_manager = graph_lock
        .as_ref()
        .ok_or_else(|| "Graph manager not initialized".to_string())?;
    
    // Query Neo4j for the node with this ID
    let cypher = "MATCH (n:Note) WHERE n.id = $node_id RETURN n.path as path LIMIT 1";
    
    use neo4rs::BoltType;
    let params = vec![
        ("node_id", BoltType::from(node_id.clone())),
    ];
    
    // Execute query
    let result = graph_manager
        .execute_query(cypher, params)
        .await
        .map_err(|e| format!("Failed to query Neo4j: {}", e))?;
    
    // Extract path from result
    if let Some(data) = result.get("data").and_then(|d| d.as_array()) {
        if let Some(row) = data.first() {
            if let Some(path) = row.get("path").and_then(|p| p.as_str()) {
                return Ok(Some(path.to_string()));
            }
        }
    }
    
    Ok(None)
}

#[tauri::command]
pub async fn batch_resolve_node_ids(
    window: Window,
    state: State<'_, AppState>,
    refactored_state: State<'_, RefactoredAppState>,
    node_ids: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    use std::collections::HashMap;
    
    if node_ids.is_empty() {
        return Ok(HashMap::new());
    }
    
    // Get graph manager
    let graph_lock = state.graph_manager.lock().await;
    let graph_manager = graph_lock
        .as_ref()
        .ok_or_else(|| "Graph manager not initialized".to_string())?;
    
    // Build list of IDs for Neo4j query
    let id_list = node_ids.iter()
        .map(|id| format!("'{}'", id))
        .collect::<Vec<_>>()
        .join(", ");
    
    // Query Neo4j for all nodes at once
    let cypher = format!(
        "MATCH (n:Note) WHERE n.id IN [{}] RETURN n.id as id, n.path as path",
        id_list
    );
    
    // Execute query (no params needed since we built the query string)
    let result = graph_manager
        .execute_query(&cypher, vec![])
        .await
        .map_err(|e| format!("Failed to query Neo4j: {}", e))?;
    
    // Build mapping from results
    let mut id_to_path = HashMap::new();
    
    if let Some(data) = result.get("data").and_then(|d| d.as_array()) {
        for row in data {
            if let (Some(id), Some(path)) = (
                row.get("id").and_then(|i| i.as_str()),
                row.get("path").and_then(|p| p.as_str())
            ) {
                id_to_path.insert(id.to_string(), path.to_string());
            }
        }
    }
    
    Ok(id_to_path)
}