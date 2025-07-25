pub mod neo4j;
pub mod qdrant;
pub mod qdrant_http;
pub mod sync;
pub mod schema;
pub mod embeddings;
pub mod shared_config;
pub mod manager;
pub mod semantic_relationships;
pub mod debug_logger;
pub mod simple_sync;
pub mod update_queue;
pub mod metrics;

pub use manager::GraphManager;

use std::sync::Arc;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use crate::docker::DockerConfig;
use tauri::AppHandle;
use neo4rs::BoltType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphConfig {
    pub vault_id: String,
    pub vault_path: String,
    pub neo4j_uri: String,
    pub neo4j_user: String,
    pub neo4j_password: String,
    pub qdrant_url: String,
}

impl From<&DockerConfig> for GraphConfig {
    fn from(docker_config: &DockerConfig) -> Self {
        GraphConfig {
            vault_id: docker_config.vault_id.clone(),
            vault_path: docker_config.vault_path.to_string_lossy().to_string(),
            neo4j_uri: format!("bolt://localhost:{}", docker_config.neo4j_bolt_port),
            neo4j_user: "neo4j".to_string(),
            neo4j_password: docker_config.neo4j_password.clone(),
            qdrant_url: format!("http://localhost:{}", docker_config.qdrant_rest_port),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub path: String,
    pub title: String,
    pub content: String,
    pub created: chrono::DateTime<chrono::Utc>,
    pub modified: chrono::DateTime<chrono::Utc>,
    pub vault_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub description: Option<String>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pattern {
    pub id: String,
    pub name: String,
    pub pattern_type: PatternType,
    pub description: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PatternType {
    Conceptual,
    Temporal,
    Structural,
    Behavioral,
    Semantic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Relationship {
    pub from_id: String,
    pub to_id: String,
    pub rel_type: String,
    pub properties: serde_json::Value,
}

#[async_trait]
pub trait GraphManagerTrait: Send + Sync {
    async fn connect(&self, config: &GraphConfig) -> Result<(), String>;
    async fn disconnect(&self) -> Result<(), String>;
    async fn is_connected(&self) -> bool;
    
    // Helper method for downcasting
    fn as_any(&self) -> &dyn std::any::Any;
    
    // Note operations
    async fn create_note(&self, note: &Note) -> Result<String, String>;
    async fn update_note(&self, note: &Note) -> Result<(), String>;
    async fn delete_note(&self, note_id: &str) -> Result<(), String>;
    async fn get_note(&self, note_id: &str) -> Result<Option<Note>, String>;
    
    // Relationship operations
    async fn create_relationship(&self, rel: &Relationship) -> Result<String, String>;
    async fn delete_relationship(&self, from_id: &str, to_id: &str, rel_type: &str) -> Result<(), String>;
    async fn get_related_notes(&self, note_id: &str, rel_type: Option<&str>, depth: i32) -> Result<Vec<Note>, String>;
    async fn relationship_exists(&self, from_id: &str, to_id: &str, rel_type: &str) -> Result<bool, String>;
    
    // Pattern operations
    async fn detect_patterns(&self, pattern_type: Option<PatternType>) -> Result<Vec<Pattern>, String>;
    async fn get_pattern_notes(&self, pattern_id: &str) -> Result<Vec<Note>, String>;
    
    // Query operations
    async fn execute_query(&self, cypher: &str, params: Vec<(&str, neo4rs::BoltType)>) -> Result<serde_json::Value, String>;
}

pub struct GraphManagerImpl {
    pub neo4j: Arc<neo4j::Neo4jManager>,
    pub qdrant: Arc<qdrant::QdrantManager>,
    pub embedding_generator: Option<Arc<embeddings::EmbeddingGenerator>>,
    current_vault_id: tokio::sync::Mutex<Option<String>>,
}

impl GraphManagerImpl {
    pub fn new(vault_id: String) -> Self {
        Self {
            neo4j: Arc::new(neo4j::Neo4jManager::new(vault_id.clone())),
            qdrant: Arc::new(qdrant::QdrantManager::new(vault_id.clone())),
            embedding_generator: None,
            current_vault_id: tokio::sync::Mutex::new(Some(vault_id)),
        }
    }
    
    pub fn with_vault_and_app_handle(vault_id: String, app_handle: AppHandle) -> Self {
        Self {
            neo4j: Arc::new(neo4j::Neo4jManager::new(vault_id.clone())),
            qdrant: Arc::new(qdrant::QdrantManager::new(vault_id.clone())),
            embedding_generator: Some(Arc::new(embeddings::EmbeddingGenerator::new(app_handle))),
            current_vault_id: tokio::sync::Mutex::new(Some(vault_id)),
        }
    }
}

#[async_trait]
impl GraphManagerTrait for GraphManagerImpl {
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
    
    async fn connect(&self, config: &GraphConfig) -> Result<(), String> {
        // Connect to Neo4j (required)
        self.neo4j.connect(&config.neo4j_uri, &config.neo4j_user, &config.neo4j_password).await?;
        
        // Try to connect to Qdrant (optional - for embeddings)
        if let Err(e) = self.qdrant.connect(&config.qdrant_url).await {
            eprintln!("Warning: Failed to connect to Qdrant (embeddings will be disabled): {}", e);
        }
        
        // Store current vault ID
        *self.current_vault_id.lock().await = Some(config.vault_id.clone());
        
        Ok(())
    }
    
    async fn disconnect(&self) -> Result<(), String> {
        self.neo4j.disconnect().await?;
        self.qdrant.disconnect().await?;
        Ok(())
    }
    
    async fn is_connected(&self) -> bool {
        // Only require Neo4j to be connected for graph sync
        // Qdrant is optional (for embeddings)
        self.neo4j.is_connected().await
    }
    
    async fn create_note(&self, note: &Note) -> Result<String, String> {
        // Create note in Neo4j
        let note_id = self.neo4j.create_note(note).await?;
        
        // Skip embedding generation during note creation
        // Embeddings can be generated on-demand using the Neo4j MCP server
        // which now has local embedding support via @xenova/transformers
        
        Ok(note_id)
    }
    
    async fn update_note(&self, note: &Note) -> Result<(), String> {
        self.neo4j.update_note(note).await?;
        
        // Skip embedding generation during note update
        // Embeddings can be generated on-demand using the Neo4j MCP server
        // which now has local embedding support via @xenova/transformers
        
        Ok(())
    }
    
    async fn delete_note(&self, note_id: &str) -> Result<(), String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.delete_note(note_id, &vault_id).await?;
        
        // Delete embedding from Qdrant
        if let Err(e) = self.qdrant.delete_note_embedding(note_id).await {
            eprintln!("Failed to delete embedding: {}", e);
        }
        
        Ok(())
    }
    
    async fn get_note(&self, note_id: &str) -> Result<Option<Note>, String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.get_note(note_id, &vault_id).await
    }
    
    async fn create_relationship(&self, rel: &Relationship) -> Result<String, String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.create_relationship(rel, &vault_id).await
    }
    
    async fn delete_relationship(&self, from_id: &str, to_id: &str, rel_type: &str) -> Result<(), String> {
        Err("Delete relationship not implemented".to_string())
    }
    
    async fn get_related_notes(&self, note_id: &str, rel_type: Option<&str>, depth: i32) -> Result<Vec<Note>, String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.get_related_notes(note_id, &vault_id, rel_type, depth).await
    }
    
    async fn relationship_exists(&self, from_id: &str, to_id: &str, rel_type: &str) -> Result<bool, String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.relationship_exists(from_id, to_id, rel_type, &vault_id).await
    }
    
    async fn detect_patterns(&self, pattern_type: Option<PatternType>) -> Result<Vec<Pattern>, String> {
        let vault_id = self.current_vault_id.lock().await
            .as_ref()
            .ok_or_else(|| "No vault connected".to_string())?
            .clone();
            
        self.neo4j.detect_patterns(&vault_id).await
    }
    
    async fn get_pattern_notes(&self, pattern_id: &str) -> Result<Vec<Note>, String> {
        // Pattern notes feature not implemented yet
        Ok(vec![])
    }
    
    async fn execute_query(&self, cypher: &str, params: Vec<(&str, neo4rs::BoltType)>) -> Result<serde_json::Value, String> {
        self.neo4j.execute_query(cypher, params).await
    }
}