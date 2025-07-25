use std::sync::Arc;
use std::path::PathBuf;
use tokio::sync::Mutex;
use serde_json::json;

use crate::graph::GraphManagerTrait;
use crate::mcp::MCPManager;
use crate::search::types::{
    HybridSearchResult, SearchQuery, GraphResult, SemanticResult, 
    MatchType, SearchMode, SearchOptions
};
use crate::search::fusion::{ResultFusion, FusionConfig};

pub struct HybridSearchManager {
    graph_manager: Arc<Mutex<Option<Arc<dyn GraphManagerTrait>>>>,
    mcp_manager: Arc<MCPManager>,
    vault_path: PathBuf,
    vault_id: String,
    fusion: ResultFusion,
}

impl HybridSearchManager {
    pub fn new(
        graph_manager: Arc<Mutex<Option<Arc<dyn GraphManagerTrait>>>>,
        mcp_manager: Arc<MCPManager>,
        vault_path: PathBuf,
        vault_id: String,
    ) -> Self {
        Self {
            graph_manager,
            mcp_manager,
            vault_path,
            vault_id,
            fusion: ResultFusion::with_default_config(),
        }
    }

    pub async fn search(&self, query: SearchQuery) -> Result<Vec<HybridSearchResult>, String> {
        match query.mode {
            SearchMode::Hybrid => self.execute_hybrid_search(&query).await,
            SearchMode::Graph => self.execute_graph_search(&query).await,
            SearchMode::Semantic => self.execute_semantic_search(&query).await,
            SearchMode::Keyword => self.execute_keyword_search(&query).await,
        }
    }

    async fn execute_hybrid_search(&self, query: &SearchQuery) -> Result<Vec<HybridSearchResult>, String> {
        // Starting hybrid search
        
        // Parse query for special filters
        let parsed_query = self.parse_query(&query.query)?;

        // Execute parallel searches
        let (graph_results, semantic_results) = tokio::join!(
            self.search_neo4j(&parsed_query, &query.options),
            self.search_qdrant(&parsed_query, &query.options)
        );

        // Handle errors from parallel searches
        let graph_results = graph_results.unwrap_or_else(|e| {
            eprintln!("Graph search error: {}", e);
            Vec::new()
        });

        let semantic_results = semantic_results.unwrap_or_else(|e| {
            eprintln!("Semantic search error: {}", e);
            Vec::new()
        });

        // Got graph and semantic results

        // Fuse results using RRF
        let mut fused_results = self.fusion.fuse_results_rrf(graph_results, semantic_results);

        // Apply result limit
        fused_results.truncate(query.options.max_results);

        // Return fused results
        Ok(fused_results)
    }

    async fn execute_graph_search(&self, query: &SearchQuery) -> Result<Vec<HybridSearchResult>, String> {
        let parsed_query = self.parse_query(&query.query)?;
        let graph_results = self.search_neo4j(&parsed_query, &query.options).await?;
        
        let mut results: Vec<HybridSearchResult> = graph_results
            .into_iter()
            .map(|r| HybridSearchResult::from_graph(&r))
            .collect();
        
        results.truncate(query.options.max_results);
        Ok(results)
    }

    async fn execute_semantic_search(&self, query: &SearchQuery) -> Result<Vec<HybridSearchResult>, String> {
        let parsed_query = self.parse_query(&query.query)?;
        let semantic_results = self.search_qdrant(&parsed_query, &query.options).await?;
        
        let mut results: Vec<HybridSearchResult> = semantic_results
            .into_iter()
            .map(|r| HybridSearchResult::from_semantic(&r))
            .collect();
        
        results.truncate(query.options.max_results);
        Ok(results)
    }

    async fn execute_keyword_search(&self, query: &SearchQuery) -> Result<Vec<HybridSearchResult>, String> {
        // For now, perform a simple file system search
        // In the future, this could use the MCP search server
        use walkdir::WalkDir;
        
        let mut results = Vec::new();
        let search_query = query.query.to_lowercase();
        
        for entry in WalkDir::new(&self.vault_path)
            .follow_links(true)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_file())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "md"))
        {
            let path = entry.path();
            let relative_path = path.strip_prefix(&self.vault_path)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string();
            
            // Read file content
            if let Ok(content) = std::fs::read_to_string(path) {
                let content_lower = content.to_lowercase();
                if content_lower.contains(&search_query) || relative_path.to_lowercase().contains(&search_query) {
                    let title = path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Untitled")
                        .to_string();
                    
                    // Extract preview around the match
                    let preview_start = content_lower.find(&search_query).unwrap_or(0);
                    let preview = content.chars()
                        .skip(preview_start.saturating_sub(50))
                        .take(200)
                        .collect::<String>();
                    
                    results.push(HybridSearchResult {
                        file_path: relative_path,
                        title,
                        relevance_score: 1.0,
                        match_type: MatchType::Direct,
                        relationship_path: None,
                        semantic_score: None,
                        preview,
                        rrf_score: None,
                        graph_rank: None,
                        semantic_rank: None,
                    });
                    
                    if results.len() >= query.options.max_results {
                        break;
                    }
                }
            }
        }
        
        Ok(results)
    }

    async fn search_neo4j(&self, query: &str, options: &SearchOptions) -> Result<Vec<GraphResult>, String> {
        let graph_lock = self.graph_manager.lock().await;
        let graph_manager = graph_lock
            .as_ref()
            .ok_or_else(|| "Graph manager not initialized".to_string())?;

        // Build and execute Cypher query
        let cypher = self.build_cypher_query(query, options);
        
        // Prepare parameters
        use neo4rs::BoltType;
        
        // Use the vault_id that was passed in (which matches what's in the database)
        let vault_id = self.vault_id.clone();
        
        // Execute Neo4j query with vault_id, query, and limit parameters
        
        let params = vec![
            ("vault_id", BoltType::from(vault_id.clone())),
            ("query", BoltType::from(query.to_string())),
            ("limit", BoltType::from((options.max_results * 2) as i64)), // Get more for fusion
        ];
        
        // Execute query using graph manager
        let results = graph_manager
            .execute_query(&cypher, params)
            .await
            .map_err(|e| format!("Neo4j query error: {}", e))?;
        
        // Parse Neo4j results

        // Convert Neo4j results to GraphResult
        self.parse_neo4j_results(results)
    }

    async fn search_qdrant(&self, query: &str, options: &SearchOptions) -> Result<Vec<SemanticResult>, String> {
        // NOTE: This is a LOCAL notes app. Semantic search should use the MCP 'gaimplan-qdrant' server
        // which is configured and used by the frontend for local embeddings.
        // 
        // Current implementation: Return empty results for semantic search from backend.
        // The frontend handles Qdrant operations through MCP for proper local-first architecture.
        
        // Semantic search is handled by frontend through MCP for local embeddings
        // Silent return - no logging to avoid console spam
        Ok(Vec::new())
    }

    fn parse_query(&self, query: &str) -> Result<String, String> {
        // Simple query parser - can be enhanced later
        // For now, just return the query as-is
        // Future: extract tags (#tag), filters, etc.
        Ok(query.to_string())
    }

    fn build_cypher_query(&self, _query: &str, _options: &SearchOptions) -> String {
        // Build Cypher query based on implementation plan
        // Using proper parameter syntax for Neo4j with case-insensitive search
        r#"
            // Direct matches - case insensitive
            MATCH (n:Note)
            WHERE n.vault_id = $vault_id AND (toLower(n.title) CONTAINS toLower($query) OR toLower(n.content) CONTAINS toLower($query))
            RETURN n, 'direct' as match_type, 1.0 as score, null as path
            LIMIT $limit
            
            UNION
            
            // Tag matches - case insensitive
            MATCH (n:Note)-[:TAGS]->(t:Tag)
            WHERE n.vault_id = $vault_id AND toLower(t.name) CONTAINS toLower($query)
            RETURN n, 'tagged' as match_type, 0.8 as score, null as path
            LIMIT $limit
            
            UNION
            
            // Linked notes (1 hop) - case insensitive
            MATCH p=(source:Note)-[:LINKS_TO]-(n:Note)
            WHERE source.vault_id = $vault_id AND toLower(source.title) CONTAINS toLower($query)
            RETURN n, 'linked' as match_type, 0.7 as score, nodes(p) as path
            LIMIT $limit
        "#.to_string()
    }

    fn parse_neo4j_results(&self, results: serde_json::Value) -> Result<Vec<GraphResult>, String> {
        // Parse Neo4j JSON results from our execute_query format
        let mut graph_results = Vec::new();
        
        if let Some(data) = results.get("data").and_then(|d| d.as_array()) {
            for row in data {
                if let Some(row_obj) = row.as_object() {
                    // Extract node from 'n' column
                    let node = row_obj.get("n")
                        .and_then(|n| n.as_object())
                        .and_then(|n| n.get("properties"))
                        .and_then(|p| p.as_object());
                    
                    if let Some(props) = node {
                        let file_path = props.get("path")
                            .and_then(|p| p.as_str())
                            .unwrap_or("")
                            .to_string();
                        
                        let title = props.get("title")
                            .and_then(|t| t.as_str())
                            .unwrap_or("")
                            .to_string();
                        
                        let match_type_str = row_obj.get("match_type")
                            .and_then(|m| m.as_str())
                            .unwrap_or("direct");
                        
                        let match_type = match match_type_str {
                            "tagged" => MatchType::Tagged,
                            "linked" => MatchType::Linked,
                            "related" => MatchType::Related,
                            _ => MatchType::Direct,
                        };
                        
                        let score = row_obj.get("score")
                            .and_then(|s| s.as_f64())
                            .unwrap_or(0.5) as f32;
                        
                        // Parse path if available
                        let relationship_path = row_obj.get("path")
                            .and_then(|p| p.as_array())
                            .map(|path_nodes| {
                                path_nodes.iter()
                                    .filter_map(|node| {
                                        node.get("properties")
                                            .and_then(|p| p.get("title"))
                                            .and_then(|t| t.as_str())
                                            .map(|s| s.to_string())
                                    })
                                    .collect()
                            });
                        
                        if !file_path.is_empty() {
                            graph_results.push(GraphResult {
                                file_path,
                                title,
                                match_type,
                                score,
                                relationship_path,
                            });
                        }
                    }
                }
            }
        }
        
        // Return parsed graph results
        Ok(graph_results)
    }

    fn parse_qdrant_response(&self, response: serde_json::Value) -> Result<Vec<SemanticResult>, String> {
        let mut semantic_results = Vec::new();
        
        if let Some(patterns) = response.get("patterns").and_then(|p| p.as_array()) {
            for pattern in patterns {
                let file_path = pattern.get("metadata")
                    .and_then(|m| m.get("file_path"))
                    .and_then(|f| f.as_str())
                    .unwrap_or("")
                    .to_string();
                
                let title = pattern.get("metadata")
                    .and_then(|m| m.get("title"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string();
                
                let score = pattern.get("score")
                    .and_then(|s| s.as_f64())
                    .unwrap_or(0.0) as f32;
                
                let preview = pattern.get("content")
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();
                
                semantic_results.push(SemanticResult {
                    file_path,
                    title,
                    score,
                    preview: preview.chars().take(200).collect(), // Limit preview length
                });
            }
        }
        
        Ok(semantic_results)
    }

    fn parse_mcp_search_response(&self, response: serde_json::Value) -> Result<Vec<HybridSearchResult>, String> {
        let mut results = Vec::new();
        
        if let Some(files) = response.get("files").and_then(|f| f.as_array()) {
            for file in files {
                let file_path = file.get("path")
                    .and_then(|p| p.as_str())
                    .unwrap_or("")
                    .to_string();
                
                let title = file.get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                
                let preview = file.get("excerpt")
                    .and_then(|e| e.as_str())
                    .unwrap_or("")
                    .to_string();
                
                results.push(HybridSearchResult {
                    file_path,
                    title,
                    relevance_score: 1.0,
                    match_type: MatchType::Direct,
                    relationship_path: None,
                    semantic_score: None,
                    preview,
                    rrf_score: None,
                    graph_rank: None,
                    semantic_rank: None,
                });
            }
        }
        
        Ok(results)
    }
}