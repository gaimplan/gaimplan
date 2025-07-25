use tokio::sync::Mutex;
use std::collections::HashMap;
use super::qdrant_http::{QdrantHttpClient, PointStruct};

pub struct QdrantManager {
    vault_id: String,
    client: Mutex<Option<QdrantHttpClient>>,
    collection_name: String,
}

impl QdrantManager {
    pub fn new(vault_id: String) -> Self {
        let collection_name = format!("vault_{}", vault_id);
        Self {
            vault_id,
            client: Mutex::new(None),
            collection_name,
        }
    }
    
    pub async fn connect(&self, url: &str) -> Result<(), String> {
        println!("[DEBUG] Connecting to Qdrant at: {}", url);
        
        // Create HTTP client
        println!("[DEBUG] Creating Qdrant HTTP client...");
        let client = QdrantHttpClient::new(url.to_string());
        
        // Test connection with timeout
        println!("[DEBUG] Testing Qdrant connection...");
        let check_future = client.check_connection();
        match tokio::time::timeout(tokio::time::Duration::from_secs(5), check_future).await {
            Ok(Ok(_)) => println!("[DEBUG] Qdrant connection test successful"),
            Ok(Err(e)) => return Err(format!("Failed to connect to Qdrant: {}", e)),
            Err(_) => return Err("Qdrant connection test timed out after 5 seconds".to_string()),
        }
        
        // List collections with timeout
        println!("[DEBUG] Listing Qdrant collections...");
        let list_future = client.list_collections();
        let collections = match tokio::time::timeout(tokio::time::Duration::from_secs(5), list_future).await {
            Ok(Ok(collections)) => collections,
            Ok(Err(e)) => return Err(format!("Failed to list Qdrant collections: {}", e)),
            Err(_) => return Err("Qdrant list collections timed out after 5 seconds".to_string()),
        };
        println!("[DEBUG] Successfully connected to Qdrant. Found {} collections", collections.len());
        
        // Initialize collection with timeout
        println!("[DEBUG] Initializing collection...");
        let init_future = self.initialize_collection(&client);
        match tokio::time::timeout(tokio::time::Duration::from_secs(10), init_future).await {
            Ok(Ok(_)) => println!("[DEBUG] Collection initialized successfully"),
            Ok(Err(e)) => return Err(format!("Failed to initialize collection: {}", e)),
            Err(_) => return Err("Collection initialization timed out after 10 seconds".to_string()),
        }
        
        *self.client.lock().await = Some(client);
        println!("[DEBUG] Successfully connected to Qdrant for vault: {}", self.vault_id);
        Ok(())
    }
    
    pub async fn disconnect(&self) -> Result<(), String> {
        *self.client.lock().await = None;
        Ok(())
    }
    
    pub async fn is_connected(&self) -> bool {
        self.client.lock().await.is_some()
    }
    
    async fn get_client(&self) -> Result<QdrantHttpClient, String> {
        self.client
            .lock()
            .await
            .as_ref()
            .cloned()
            .ok_or_else(|| "Qdrant not connected".to_string())
    }
    
    async fn initialize_collection(&self, client: &QdrantHttpClient) -> Result<(), String> {
        let collection_name = &self.collection_name;
        
        // Check if collections exist
        let collections = client.list_collections().await?;
        
        let collection_names: Vec<String> = collections
            .iter()
            .map(|c| c.name.clone())
            .collect();
        
        // Create collection if it doesn't exist
        if !collection_names.contains(collection_name) {
            println!("[DEBUG] Creating collection: {}", collection_name);
            client.create_collection(collection_name, 1536).await?; // OpenAI embedding size
            println!("[DEBUG] Collection created successfully");
        } else {
            println!("[DEBUG] Collection {} already exists", collection_name);
        }
        
        Ok(())
    }
    
    pub async fn upsert_note_embedding(
        &self,
        note_id: &str,
        embedding: &[f32],
    ) -> Result<(), String> {
        let client = self.get_client().await?;
        
        let mut payload = HashMap::new();
        payload.insert("note_id".to_string(), serde_json::json!(note_id));
        payload.insert("vault_id".to_string(), serde_json::json!(self.vault_id));
        
        let point = PointStruct {
            id: note_id.to_string(),
            vector: embedding.to_vec(),
            payload,
        };
        
        client.upsert_points(&self.collection_name, vec![point]).await?;
        
        Ok(())
    }
    
    pub async fn delete_note_embedding(&self, note_id: &str) -> Result<(), String> {
        let client = self.get_client().await?;
        
        client.delete_points(&self.collection_name, vec![note_id.to_string()]).await?;
        
        Ok(())
    }
    
    pub async fn search_similar(
        &self,
        query_embedding: Vec<f32>,
        limit: usize,
    ) -> Result<Vec<(String, f32)>, String> {
        let client = self.get_client().await?;
        
        let search_results = client.search_points(&self.collection_name, query_embedding, limit).await?;
        
        let results: Vec<(String, f32)> = search_results
            .into_iter()
            .map(|result| (result.id, result.score))
            .collect();
        
        Ok(results)
    }
    
    pub async fn clear_collection(&self) -> Result<(), String> {
        let client = self.get_client().await?;
        
        println!("[DEBUG] Clearing Qdrant collection: {}", self.collection_name);
        
        // Delete all points from the collection
        // Since we don't have a direct "clear all" method, we'll delete and recreate the collection
        match client.delete_collection(&self.collection_name).await {
            Ok(_) => println!("[DEBUG] Collection deleted successfully"),
            Err(e) => println!("[DEBUG] Warning: Failed to delete collection: {}", e),
        }
        
        // Recreate the collection
        self.initialize_collection(&client).await?;
        
        println!("[DEBUG] Qdrant collection cleared and recreated");
        Ok(())
    }
    
}