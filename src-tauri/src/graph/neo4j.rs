use neo4rs::{Graph, Node, query};
use tokio::sync::Mutex;
use chrono::{DateTime, Utc};
use super::{GraphConfig, Note, Pattern, PatternType, Relationship};

pub struct Neo4jManager {
    vault_id: String,
    graph: Mutex<Option<Graph>>,
}

impl Neo4jManager {
    pub fn new(vault_id: String) -> Self {
        Self {
            vault_id,
            graph: Mutex::new(None),
        }
    }
    
    pub async fn connect(&self, uri: &str, user: &str, password: &str) -> Result<(), String> {
        println!("Neo4j connection attempt:");
        println!("  URI: {}", uri);
        println!("  User: {}", user);
        println!("  Password: {}", password); // Show full password for debugging
        
        // Add a small delay to ensure Neo4j is ready after restart
        println!("Waiting for Neo4j to be ready...");
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        // Try using ConfigBuilder instead
        use neo4rs::ConfigBuilder;
        println!("Building Neo4j config...");
        let config = ConfigBuilder::default()
            .uri(uri)
            .user(user)
            .password(password)
            .build()
            .map_err(|e| format!("Failed to build Neo4j config: {}", e))?;
        
        println!("Attempting to connect to Neo4j...");
        // Add timeout to prevent hanging
        let connect_future = Graph::connect(config);
        let timeout_duration = tokio::time::Duration::from_secs(10);
        
        let graph = match tokio::time::timeout(timeout_duration, connect_future).await {
            Ok(Ok(graph)) => {
                println!("Successfully connected to Neo4j");
                graph
            }
            Ok(Err(e)) => {
                println!("Failed to connect to Neo4j: {}", e);
                return Err(format!("Failed to connect to Neo4j: {}", e));
            }
            Err(_) => {
                println!("Neo4j connection timed out after 10 seconds");
                return Err("Neo4j connection timed out after 10 seconds".to_string());
            }
        };
        
        // Run connection test
        println!("Testing Neo4j connection...");
        let test_future = graph.execute(query("RETURN 1 as n"));
        let mut result = match tokio::time::timeout(tokio::time::Duration::from_secs(5), test_future).await {
            Ok(Ok(result)) => result,
            Ok(Err(e)) => return Err(format!("Failed to test Neo4j connection: {}", e)),
            Err(_) => return Err("Neo4j connection test timed out".to_string()),
        };
        
        // Consume the result to ensure connection works
        while let Ok(Some(_)) = result.next().await {}
        println!("Neo4j connection test successful");
        
        *self.graph.lock().await = Some(graph);
        
        // Initialize schema - but don't fail if it errors
        println!("Initializing Neo4j schema...");
        match self.initialize_schema().await {
            Ok(_) => println!("Neo4j schema initialization successful"),
            Err(e) => println!("Warning: Schema initialization had issues: {} (continuing anyway)", e),
        }
        println!("Neo4j connection fully established");
        
        Ok(())
    }
    
    pub async fn disconnect(&self) -> Result<(), String> {
        *self.graph.lock().await = None;
        Ok(())
    }
    
    pub async fn is_connected(&self) -> bool {
        self.graph.lock().await.is_some()
    }
    
    async fn get_graph(&self) -> Result<Graph, String> {
        self.graph
            .lock()
            .await
            .as_ref()
            .cloned()
            .ok_or_else(|| "Neo4j not connected".to_string())
    }
    
    async fn initialize_schema(&self) -> Result<(), String> {
        let graph = self.get_graph().await?;
        
        // Create constraints and indexes with vault_id for proper isolation
        // Note: Using simple UNIQUE constraints for Community Edition compatibility
        let constraints = vec![
            "CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT tag_id IF NOT EXISTS FOR (t:Tag) REQUIRE t.id IS UNIQUE",
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE",
        ];
        
        let indexes = vec![
            "CREATE INDEX note_title IF NOT EXISTS FOR (n:Note) ON (n.title)",
            "CREATE INDEX note_created IF NOT EXISTS FOR (n:Note) ON (n.created)",
            "CREATE INDEX note_modified IF NOT EXISTS FOR (n:Note) ON (n.modified)",
            "CREATE INDEX note_vault IF NOT EXISTS FOR (n:Note) ON (n.vault_id)",
            "CREATE INDEX tag_vault IF NOT EXISTS FOR (t:Tag) ON (t.vault_id)",
            "CREATE INDEX entity_vault IF NOT EXISTS FOR (e:Entity) ON (e.vault_id)",
            "CREATE INDEX pattern_vault IF NOT EXISTS FOR (p:Pattern) ON (p.vault_id)",
            "CREATE FULLTEXT INDEX note_content IF NOT EXISTS FOR (n:Note) ON EACH [n.content, n.title]",
        ];
        
        // Execute constraints with timeout
        println!("Creating constraints...");
        for (i, constraint) in constraints.iter().enumerate() {
            let constraint_name = constraint.split(" ").nth(2).unwrap_or("");
            println!("  Creating constraint {}/{}: {}", i + 1, constraints.len(), constraint_name);
            
            // First try to drop the constraint if it exists (to handle corrupted state)
            let drop_query = format!("DROP CONSTRAINT {} IF EXISTS", constraint_name);
            let drop_future = graph.execute(query(&drop_query));
            let _ = tokio::time::timeout(tokio::time::Duration::from_secs(2), drop_future).await;
            
            // Now create the constraint
            let future = graph.execute(query(constraint));
            match tokio::time::timeout(tokio::time::Duration::from_secs(10), future).await {
                Ok(Ok(mut result)) => {
                    // Consume the result to ensure the query completes
                    while let Ok(Some(_)) = result.next().await {}
                    println!("    Constraint created successfully");
                },
                Ok(Err(e)) => {
                    // Check if it's an already exists error
                    let err_str = e.to_string();
                    if err_str.contains("already exists") || err_str.contains("ConstraintAlreadyExists") || err_str.contains("Equivalent constraint already exists") {
                        println!("    Constraint already exists, continuing...");
                    } else {
                        println!("    Error creating constraint: {}", e);
                        // Don't fail on constraint errors, they might already exist
                    }
                },
                Err(_) => {
                    println!("    Constraint creation timed out after 10 seconds, continuing...");
                    // Don't fail on timeout, constraint might already exist
                }
            }
        }
        
        // Execute indexes with timeout
        println!("Creating indexes...");
        for (i, index) in indexes.iter().enumerate() {
            let index_name = index.split(" ").nth(2).unwrap_or("");
            println!("  Creating index {}/{}: {}", i + 1, indexes.len(), index_name);
            
            let future = graph.execute(query(index));
            match tokio::time::timeout(tokio::time::Duration::from_secs(10), future).await {
                Ok(Ok(mut result)) => {
                    // Consume the result to ensure the query completes
                    while let Ok(Some(_)) = result.next().await {}
                    println!("    Index created successfully");
                },
                Ok(Err(e)) => {
                    // Check if it's an already exists error
                    let err_str = e.to_string();
                    if err_str.contains("already exists") || err_str.contains("IndexAlreadyExists") || err_str.contains("Equivalent index already exists") {
                        println!("    Index already exists, continuing...");
                    } else {
                        println!("    Error creating index: {}", e);
                        // Don't fail on index errors, they might already exist
                    }
                },
                Err(_) => {
                    println!("    Index creation timed out after 10 seconds, continuing...");
                    // Don't fail on timeout, index might already exist
                }
            }
        }
        
        println!("Schema initialization complete");
        Ok(())
    }
    
    pub async fn create_note(&self, note: &Note) -> Result<String, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MERGE (n:Note {id: $id, vault_id: $vault_id})
            ON CREATE SET 
                n.path = $path,
                n.title = $title,
                n.content = $content,
                n.created = $created,
                n.modified = $modified
            ON MATCH SET
                n.path = $path,
                n.title = $title,
                n.content = $content,
                n.modified = $modified
            RETURN n.id as id
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("id", note.id.clone())
                    .param("path", note.path.clone())
                    .param("title", note.title.clone())
                    .param("content", note.content.clone())
                    .param("created", note.created.timestamp())
                    .param("modified", note.modified.timestamp())
                    .param("vault_id", note.vault_id.clone())
            )
            .await
            .map_err(|e| format!("Failed to create note: {}", e))?;
        
        if let Ok(Some(row)) = result.next().await {
            let id: String = row.get("id").map_err(|e| format!("Failed to get note ID: {}", e))?;
            Ok(id)
        } else {
            Err("Failed to create note: no result returned".to_string())
        }
    }
    
    pub async fn update_note(&self, note: &Note) -> Result<(), String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MATCH (n:Note {id: $id, vault_id: $vault_id})
            SET n.path = $path,
                n.title = $title,
                n.content = $content,
                n.modified = $modified
            RETURN n.id as id
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("id", note.id.clone())
                    .param("vault_id", note.vault_id.clone())
                    .param("path", note.path.clone())
                    .param("title", note.title.clone())
                    .param("content", note.content.clone())
                    .param("modified", note.modified.timestamp())
            )
            .await
            .map_err(|e| format!("Failed to update note: {}", e))?;
        
        if result.next().await.is_ok() {
            Ok(())
        } else {
            Err("Note not found".to_string())
        }
    }
    
    pub async fn delete_note(&self, note_id: &str, vault_id: &str) -> Result<(), String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MATCH (n:Note {id: $id, vault_id: $vault_id})
            DETACH DELETE n
        "#;
        
        graph
            .execute(
                query(query_str)
                    .param("id", note_id.to_string())
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to delete note: {}", e))?;
        
        Ok(())
    }
    
    pub async fn get_note(&self, note_id: &str, vault_id: &str) -> Result<Option<Note>, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MATCH (n:Note {id: $id, vault_id: $vault_id})
            RETURN n
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("id", note_id.to_string())
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to get note: {}", e))?;
        
        if let Ok(Some(row)) = result.next().await {
            let node: Node = row.get("n").map_err(|e| format!("Failed to get node: {}", e))?;
            let note = self.node_to_note(node)?;
            Ok(Some(note))
        } else {
            Ok(None)
        }
    }
    
    fn node_to_note(&self, node: Node) -> Result<Note, String> {
        let id: String = node.get("id").map_err(|e| format!("Failed to get id: {}", e))?;
        let path: String = node.get("path").map_err(|e| format!("Failed to get path: {}", e))?;
        let title: String = node.get("title").map_err(|e| format!("Failed to get title: {}", e))?;
        let content: String = node.get("content").map_err(|e| format!("Failed to get content: {}", e))?;
        let created: i64 = node.get("created").map_err(|e| format!("Failed to get created: {}", e))?;
        let modified: i64 = node.get("modified").map_err(|e| format!("Failed to get modified: {}", e))?;
        let vault_id: String = node.get("vault_id").map_err(|e| format!("Failed to get vault_id: {}", e))?;
        
        Ok(Note {
            id,
            path,
            title,
            content,
            created: DateTime::from_timestamp(created, 0)
                .ok_or_else(|| "Invalid created timestamp".to_string())?
                .with_timezone(&Utc),
            modified: DateTime::from_timestamp(modified, 0)
                .ok_or_else(|| "Invalid modified timestamp".to_string())?
                .with_timezone(&Utc),
            vault_id,
        })
    }
    
    pub async fn create_relationship(&self, rel: &Relationship, vault_id: &str) -> Result<String, String> {
        let graph = self.get_graph().await?;
        
        // Handle different relationship types
        let query_str = match rel.rel_type.as_str() {
            "TAGGED_WITH" => {
                // For tags, create the tag node if it doesn't exist
                if let Some(tag_name) = rel.properties.get("tag_name").and_then(|v| v.as_str()) {
                    format!(
                        r#"
                        MATCH (from:Note {{id: $from_id, vault_id: $vault_id}})
                        MERGE (to:Tag {{id: $to_id, name: $tag_name, vault_id: $vault_id}})
                        MERGE (from)-[r:TAGGED_WITH]->(to)
                        RETURN id(r) as rel_id
                        "#
                    )
                } else {
                    return Err("Tag name required for TAGGED_WITH relationship".to_string());
                }
            },
            "LINKS_TO" => {
                // For links, we'll handle this differently once we resolve note IDs
                format!(
                    r#"
                    MATCH (from:Note {{id: $from_id, vault_id: $vault_id}})
                    MERGE (to:LinkedNote {{id: $to_id, vault_id: $vault_id}})
                    MERGE (from)-[r:LINKS_TO]->(to)
                    RETURN id(r) as rel_id
                    "#
                )
            },
            _ => {
                // Generic relationship between existing nodes
                crate::graph::debug_logger::debug_log(&format!("🔗 Neo4j: Creating {} relationship from {} to {}", rel.rel_type, rel.from_id, rel.to_id));
                
                // For semantic relationships, we need to check if one already exists
                // MERGE alone isn't enough because we want to update properties if it exists
                format!(
                    r#"
                    MATCH (from:Note {{id: $from_id, vault_id: $vault_id}})
                    MATCH (to:Note {{id: $to_id, vault_id: $vault_id}})
                    MERGE (from)-[r:{}]->(to)
                    ON CREATE SET 
                        r.confidence = $confidence,
                        r.similarity = $similarity,
                        r.method = $method,
                        r.created_at = datetime(),
                        r.updated_at = datetime()
                    ON MATCH SET
                        r.confidence = CASE WHEN $confidence > r.confidence THEN $confidence ELSE r.confidence END,
                        r.similarity = CASE WHEN $similarity > r.similarity THEN $similarity ELSE r.similarity END,
                        r.updated_at = datetime()
                    RETURN id(r) as rel_id
                    "#,
                    rel.rel_type
                )
            }
        };
        
        let mut q = query(&query_str)
            .param("from_id", rel.from_id.clone())
            .param("to_id", rel.to_id.clone())
            .param("vault_id", vault_id.to_string());
            
        // Add properties from the relationship
        if rel.rel_type == "TAGGED_WITH" {
            if let Some(tag_name) = rel.properties.get("tag_name").and_then(|v| v.as_str()) {
                q = q.param("tag_name", tag_name);
            }
        } else {
            // For semantic relationships, extract properties
            let confidence = rel.properties.get("confidence")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.5);
            let similarity = rel.properties.get("similarity")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let method = rel.properties.get("method")
                .and_then(|v| v.as_str())
                .unwrap_or("semantic_analysis");
                
            q = q.param("confidence", confidence)
                 .param("similarity", similarity)
                 .param("method", method);
        }
        
        let mut result = graph
            .execute(q)
            .await
            .map_err(|e| {
                crate::graph::debug_logger::debug_log(&format!("❌ Neo4j error creating relationship: {}", e));
                format!("Failed to create relationship: {}", e)
            })?;
        
        match result.next().await {
            Ok(Some(row)) => {
                let rel_id: i64 = row.get("rel_id").map_err(|e| format!("Failed to get relationship ID: {}", e))?;
                crate::graph::debug_logger::debug_log(&format!("✅ Relationship created successfully with ID: {}", rel_id));
                Ok(rel_id.to_string())
            }
            Ok(None) => {
                crate::graph::debug_logger::debug_log("❌ No result returned - nodes might not exist");
                Err("Failed to create relationship: nodes not found".to_string())
            }
            Err(e) => {
                crate::graph::debug_logger::debug_log(&format!("❌ Error retrieving result: {}", e));
                Err(format!("Failed to retrieve relationship result: {}", e))
            }
        }
    }
    
    pub async fn relationship_exists(&self, from_id: &str, to_id: &str, rel_type: &str, vault_id: &str) -> Result<bool, String> {
        let graph = self.get_graph().await?;
        
        // Check if a relationship of the specified type exists between two nodes
        let query_str = r#"
            MATCH (from:Note {id: $from_id, vault_id: $vault_id})
            MATCH (to:Note {id: $to_id, vault_id: $vault_id})
            RETURN EXISTS((from)-[:`REL_TYPE`]-(to)) as exists
        "#.replace("REL_TYPE", rel_type);
        
        let mut result = graph
            .execute(
                query(&query_str)
                    .param("from_id", from_id.to_string())
                    .param("to_id", to_id.to_string())
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to check relationship existence: {}", e))?;
        
        match result.next().await {
            Ok(Some(row)) => {
                let exists: bool = row.get("exists").unwrap_or(false);
                Ok(exists)
            }
            Ok(None) => Ok(false), // Nodes don't exist
            Err(e) => Err(format!("Failed to check relationship: {}", e)),
        }
    }
    
    pub async fn get_related_notes(&self, note_id: &str, vault_id: &str, rel_type: Option<&str>, depth: i32) -> Result<Vec<Note>, String> {
        let graph = self.get_graph().await?;
        
        let query_str = if let Some(rel_type) = rel_type {
            format!(
                r#"
                MATCH (start:Note {{id: $id, vault_id: $vault_id}})
                MATCH path = (start)-[:{}*1..{}]-(related:Note)
                WHERE related.id <> $id AND related.vault_id = $vault_id
                RETURN DISTINCT related
                ORDER BY related.modified DESC
                "#,
                rel_type, depth
            )
        } else {
            format!(
                r#"
                MATCH (start:Note {{id: $id, vault_id: $vault_id}})
                MATCH path = (start)-[*1..{}]-(related:Note)
                WHERE related.id <> $id AND related.vault_id = $vault_id
                RETURN DISTINCT related
                ORDER BY related.modified DESC
                "#,
                depth
            )
        };
        
        let mut result = graph
            .execute(
                query(&query_str)
                    .param("id", note_id.to_string())
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to get related notes: {}", e))?;
        
        let mut notes = Vec::new();
        while let Ok(Some(row)) = result.next().await {
            let node: Node = row.get("related").map_err(|e| format!("Failed to get node: {}", e))?;
            let note = self.node_to_note(node)?;
            notes.push(note);
        }
        
        Ok(notes)
    }
    
    pub async fn detect_patterns(&self, _vault_id: &str) -> Result<Vec<Pattern>, String> {
        // TODO: Implement pattern detection algorithms for specific vault
        Ok(vec![])
    }
    
    pub async fn search_notes_fulltext(&self, search_query: &str, vault_id: &str, limit: usize) -> Result<Vec<Note>, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            CALL db.index.fulltext.queryNodes('note_content', $query)
            YIELD node, score
            WHERE node.vault_id = $vault_id
            RETURN node
            ORDER BY score DESC
            LIMIT $limit
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("query", search_query.to_string())
                    .param("vault_id", vault_id.to_string())
                    .param("limit", limit as i64)
            )
            .await
            .map_err(|e| format!("Failed to search notes: {}", e))?;
        
        let mut notes = Vec::new();
        while let Ok(Some(row)) = result.next().await {
            let node: Node = row.get("node").map_err(|e| format!("Failed to get node: {}", e))?;
            let note = self.node_to_note(node)?;
            notes.push(note);
        }
        
        Ok(notes)
    }
    
    pub async fn clear_vault_data(&self, vault_id: &str) -> Result<(), String> {
        let graph = self.get_graph().await?;
        
        println!("Clearing all data for vault: {}", vault_id);
        
        // Delete all relationships first (Neo4j requires this)
        let delete_relationships = r#"
            MATCH (n {vault_id: $vault_id})-[r]-(m)
            WHERE m.vault_id = $vault_id OR m.vault_id IS NULL
            DELETE r
        "#;
        
        let _ = graph
            .execute(
                query(delete_relationships)
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to delete relationships: {}", e))?;
            
        println!("Deleted all relationships for vault: {}", vault_id);
        
        // Delete all nodes
        let delete_nodes = r#"
            MATCH (n)
            WHERE n.vault_id = $vault_id
            DELETE n
        "#;
        
        let _ = graph
            .execute(
                query(delete_nodes)
                    .param("vault_id", vault_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to delete nodes: {}", e))?;
            
        println!("Deleted all nodes for vault: {}", vault_id);
        
        Ok(())
    }
    
    pub async fn execute_query(&self, cypher: &str, params: Vec<(&str, neo4rs::BoltType)>) -> Result<serde_json::Value, String> {
        let graph = self.get_graph().await?;
        
        // Execute the query with provided parameters
        let mut result = graph
            .execute(query(cypher).params(params))
            .await
            .map_err(|e| format!("Failed to execute query: {}", e))?;
        
        // Collect results into JSON format
        let mut rows = Vec::new();
        
        while let Ok(Some(row)) = result.next().await {
            let mut row_data = serde_json::Map::new();
            
            // Neo4rs doesn't provide a way to get column names directly
            // We'll try common column names used in our queries
            let columns = vec!["n", "match_type", "score", "path", "t", "source", "linked", "related"];
            
            for col in columns {
                if let Ok(node) = row.get::<neo4rs::Node>(col) {
                    // Handle Node type
                    // Extract common properties we use
                    let mut properties = serde_json::Map::new();
                    
                    // Try to get common properties
                    if let Ok(id) = node.get::<String>("id") {
                        properties.insert("id".to_string(), serde_json::json!(id));
                    }
                    if let Ok(path) = node.get::<String>("path") {
                        properties.insert("path".to_string(), serde_json::json!(path));
                    }
                    if let Ok(title) = node.get::<String>("title") {
                        properties.insert("title".to_string(), serde_json::json!(title));
                    }
                    if let Ok(content) = node.get::<String>("content") {
                        properties.insert("content".to_string(), serde_json::json!(content));
                    }
                    if let Ok(vault_id) = node.get::<String>("vault_id") {
                        properties.insert("vault_id".to_string(), serde_json::json!(vault_id));
                    }
                    
                    let node_json = serde_json::json!({
                        "labels": node.labels(),
                        "properties": properties,
                    });
                    row_data.insert(col.to_string(), node_json);
                } else if let Ok(value) = row.get::<String>(col) {
                    // Handle String type
                    row_data.insert(col.to_string(), serde_json::Value::String(value));
                } else if let Ok(value) = row.get::<f64>(col) {
                    // Handle numeric type
                    row_data.insert(col.to_string(), serde_json::json!(value));
                } else if let Ok(value) = row.get::<i64>(col) {
                    // Handle integer type
                    row_data.insert(col.to_string(), serde_json::json!(value));
                } else if let Ok(value) = row.get::<neo4rs::BoltType>(col) {
                    // Handle generic BoltType
                    row_data.insert(col.to_string(), bolt_type_to_json(value));
                }
            }
            
            rows.push(serde_json::Value::Object(row_data));
        }
        
        Ok(serde_json::json!({
            "data": rows
        }))
    }
}

// Helper function to convert BoltType to JSON
fn bolt_type_to_json(bolt_value: neo4rs::BoltType) -> serde_json::Value {
    use neo4rs::BoltType;
    
    match bolt_value {
        BoltType::Null(_) => serde_json::Value::Null,
        BoltType::Boolean(b) => serde_json::json!(b.value),
        BoltType::Integer(i) => serde_json::json!(i.value),
        BoltType::Float(f) => serde_json::json!(f.value),
        BoltType::String(s) => serde_json::json!(s.value),
        BoltType::List(l) => {
            let items: Vec<serde_json::Value> = l.value.into_iter()
                .map(bolt_type_to_json)
                .collect();
            serde_json::Value::Array(items)
        },
        BoltType::Map(m) => {
            let mut map = serde_json::Map::new();
            for (k, v) in m.value {
                map.insert(k.to_string(), bolt_type_to_json(v));
            }
            serde_json::Value::Object(map)
        },
        _ => serde_json::Value::Null, // For other types we don't handle yet
    }
}