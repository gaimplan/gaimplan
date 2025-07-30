use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedGraphConfig {
    pub neo4j_uri: String,
    pub neo4j_user: String,
    pub neo4j_password: String,
    pub qdrant_url: String,
}

impl Default for SharedGraphConfig {
    fn default() -> Self {
        Self {
            neo4j_uri: "bolt://localhost:7687".to_string(),
            neo4j_user: "neo4j".to_string(),
            neo4j_password: "GaimplanKnowledgeGraph2025".to_string(),
            qdrant_url: "http://localhost:6333".to_string(),
        }
    }
}

impl SharedGraphConfig {
    pub fn from_env() -> Self {
        Self {
            neo4j_uri: std::env::var("gaimplan_NEO4J_URI")
                .unwrap_or_else(|_| "bolt://localhost:7687".to_string()),
            neo4j_user: std::env::var("gaimplan_NEO4J_USER")
                .unwrap_or_else(|_| "neo4j".to_string()),
            neo4j_password: std::env::var("gaimplan_NEO4J_PASSWORD")
                .unwrap_or_else(|_| "gaimplanKnowledgeGraph2025".to_string()),
            qdrant_url: std::env::var("gaimplan_QDRANT_URL")
                .unwrap_or_else(|_| "http://localhost:6333".to_string()),
        }
    }
}