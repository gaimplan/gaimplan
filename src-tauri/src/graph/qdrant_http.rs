use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;

#[derive(Debug)]
pub struct QdrantHttpClient {
    client: Client,
    base_url: String,
}

impl Clone for QdrantHttpClient {
    fn clone(&self) -> Self {
        Self {
            client: Client::builder()
                .http1_only()
                .build()
                .unwrap(),
            base_url: self.base_url.clone(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionInfo {
    pub name: String,
    pub vectors_count: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionsResponse {
    pub result: CollectionsResult,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CollectionsResult {
    pub collections: Vec<CollectionInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateCollectionRequest {
    pub vectors: VectorParams,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VectorParams {
    pub size: u64,
    pub distance: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PointStruct {
    pub id: String,
    pub vector: Vec<f32>,
    pub payload: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertRequest {
    pub points: Vec<PointStruct>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchRequest {
    pub vector: Vec<f32>,
    pub limit: usize,
    pub with_payload: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub payload: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResponse {
    pub result: Vec<SearchResult>,
}

impl QdrantHttpClient {
    pub fn new(base_url: String) -> Self {
        let client = Client::builder()
            .http1_only() // Force HTTP/1.1
            .build()
            .unwrap();
        
        Self { client, base_url }
    }
    
    pub async fn check_connection(&self) -> Result<(), String> {
        let response = self.client
            .get(&self.base_url)
            .send()
            .await
            .map_err(|e| format!("Connection failed: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            Err(format!("Connection check failed with status: {}", response.status()))
        }
    }
    
    pub async fn list_collections(&self) -> Result<Vec<CollectionInfo>, String> {
        let url = format!("{}/collections", self.base_url);
        
        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to list collections: {}", e))?;
        
        if !response.status().is_success() {
            return Err(format!("List collections failed with status: {}", response.status()));
        }
        
        let collections_response: CollectionsResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse collections response: {}", e))?;
        
        Ok(collections_response.result.collections)
    }
    
    pub async fn create_collection(&self, name: &str, vector_size: u64) -> Result<(), String> {
        let url = format!("{}/collections/{}", self.base_url, name);
        
        let request_body = CreateCollectionRequest {
            vectors: VectorParams {
                size: vector_size,
                distance: "Cosine".to_string(),
            },
        };
        
        let response = self.client
            .put(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to create collection: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(format!("Create collection failed: {}", error_text))
        }
    }
    
    pub async fn delete_collection(&self, name: &str) -> Result<(), String> {
        let url = format!("{}/collections/{}", self.base_url, name);
        
        let response = self.client
            .delete(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to delete collection: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(format!("Delete collection failed: {}", error_text))
        }
    }
    
    pub async fn upsert_points(&self, collection_name: &str, points: Vec<PointStruct>) -> Result<(), String> {
        let url = format!("{}/collections/{}/points", self.base_url, collection_name);
        
        let request_body = UpsertRequest { points };
        
        let response = self.client
            .put(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to upsert points: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(format!("Upsert points failed: {}", error_text))
        }
    }
    
    pub async fn search_points(&self, collection_name: &str, vector: Vec<f32>, limit: usize) -> Result<Vec<SearchResult>, String> {
        let url = format!("{}/collections/{}/points/search", self.base_url, collection_name);
        
        let request_body = SearchRequest {
            vector,
            limit,
            with_payload: true,
        };
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to search points: {}", e))?;
        
        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Search failed: {}", error_text));
        }
        
        let search_response: SearchResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse search response: {}", e))?;
        
        Ok(search_response.result)
    }
    
    pub async fn delete_points(&self, collection_name: &str, point_ids: Vec<String>) -> Result<(), String> {
        let url = format!("{}/collections/{}/points/delete", self.base_url, collection_name);
        
        let request_body = json!({
            "points": point_ids
        });
        
        let response = self.client
            .post(&url)
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Failed to delete points: {}", e))?;
        
        if response.status().is_success() {
            Ok(())
        } else {
            let error_text = response.text().await.unwrap_or_default();
            Err(format!("Delete points failed: {}", error_text))
        }
    }
}