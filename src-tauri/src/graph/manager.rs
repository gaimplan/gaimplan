use super::{Note, Pattern, Relationship, Entity};
use super::neo4j::Neo4jManager;
use super::qdrant::QdrantManager;
use super::embeddings::EmbeddingGenerator;
use super::shared_config::SharedGraphConfig;
// use crate::settings::SettingsManager; // Removed - not needed

pub struct GraphManager {
    vault_id: String,
    neo4j: Neo4jManager,
    qdrant: QdrantManager,
    embeddings: Option<EmbeddingGenerator>,
}

impl GraphManager {
    pub async fn new(vault_id: String) -> Result<Self, String> {
        let config = SharedGraphConfig::from_env();
        
        // Initialize Neo4j connection
        let mut neo4j = Neo4jManager::new(vault_id.clone());
        neo4j.connect(&config.neo4j_uri, &config.neo4j_user, &config.neo4j_password).await?;
        
        // Initialize Qdrant connection
        let qdrant = QdrantManager::new(vault_id.clone());
        qdrant.connect(&config.qdrant_url).await?;
        
        // Initialize embeddings if AI is configured
        let embeddings = EmbeddingGenerator::new_if_configured().await.ok();
        
        Ok(Self {
            vault_id,
            neo4j,
            qdrant,
            embeddings,
        })
    }
    
    pub async fn create_note(&self, mut note: Note) -> Result<String, String> {
        // Ensure note has correct vault_id
        note.vault_id = self.vault_id.clone();
        
        // Create in Neo4j
        let note_id = self.neo4j.create_note(&note).await?;
        
        // Generate and store embeddings if available
        if let Some(embeddings) = &self.embeddings {
            let embedding_text = format!("{}\n\n{}", note.title, note.content);
            match embeddings.generate_embedding(&embedding_text).await {
                Ok(embedding) => {
                    if let Err(e) = self.qdrant.upsert_note_embedding(&note_id, &embedding).await {
                        eprintln!("Failed to store embedding: {}", e);
                    }
                }
                Err(e) => eprintln!("Failed to generate embedding: {}", e),
            }
        }
        
        Ok(note_id)
    }
    
    pub async fn update_note(&self, mut note: Note) -> Result<(), String> {
        // Ensure note has correct vault_id
        note.vault_id = self.vault_id.clone();
        
        // Update in Neo4j
        self.neo4j.update_note(&note).await?;
        
        // Update embeddings if available
        if let Some(embeddings) = &self.embeddings {
            let embedding_text = format!("{}\n\n{}", note.title, note.content);
            match embeddings.generate_embedding(&embedding_text).await {
                Ok(embedding) => {
                    if let Err(e) = self.qdrant.upsert_note_embedding(&note.id, &embedding).await {
                        eprintln!("Failed to update embedding: {}", e);
                    }
                }
                Err(e) => eprintln!("Failed to generate embedding: {}", e),
            }
        }
        
        Ok(())
    }
    
    pub async fn delete_note(&self, note_id: &str) -> Result<(), String> {
        // Delete from Neo4j
        self.neo4j.delete_note(note_id, &self.vault_id).await?;
        
        // Delete from Qdrant
        if let Err(e) = self.qdrant.delete_note_embedding(note_id).await {
            eprintln!("Failed to delete embedding: {}", e);
        }
        
        Ok(())
    }
    
    pub async fn get_note(&self, note_id: &str) -> Result<Option<Note>, String> {
        self.neo4j.get_note(note_id, &self.vault_id).await
    }
    
    pub async fn search_similar_notes(&self, query: &str, limit: usize) -> Result<Vec<Note>, String> {
        if let Some(embeddings) = &self.embeddings {
            // Generate query embedding
            let query_embedding = embeddings.generate_embedding(query).await?;
            
            // Search in Qdrant
            let search_results = self.qdrant.search_similar(query_embedding, limit).await?;
            
            // Fetch notes from Neo4j
            let mut notes = Vec::new();
            for (note_id, _score) in search_results {
                if let Some(note) = self.neo4j.get_note(&note_id, &self.vault_id).await? {
                    notes.push(note);
                }
            }
            
            Ok(notes)
        } else {
            // Fallback to text search in Neo4j
            self.neo4j.search_notes_fulltext(query, &self.vault_id, limit).await
        }
    }
    
    pub async fn create_relationship(&self, rel: &Relationship) -> Result<String, String> {
        self.neo4j.create_relationship(rel, &self.vault_id).await
    }
    
    pub async fn get_related_notes(
        &self, 
        note_id: &str, 
        rel_type: Option<&str>, 
        depth: i32
    ) -> Result<Vec<Note>, String> {
        self.neo4j.get_related_notes(note_id, &self.vault_id, rel_type, depth).await
    }
    
    pub async fn detect_patterns(&self) -> Result<Vec<Pattern>, String> {
        self.neo4j.detect_patterns(&self.vault_id).await
    }
}