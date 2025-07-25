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
        let graph = Graph::new(uri, user, password)
            .await
            .map_err(|e| format!("Failed to connect to Neo4j: {}", e))?;
        
        // Run connection test
        let mut result = graph
            .execute(query("RETURN 1 as n"))
            .await
            .map_err(|e| format!("Failed to test Neo4j connection: {}", e))?;
        
        // Consume the result to ensure connection works
        while let Ok(Some(_)) = result.next().await {}
        
        *self.graph.lock().await = Some(graph);
        
        // Initialize schema
        self.initialize_schema().await?;
        
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
        
        // Create constraints and indexes
        let constraints = vec![
            "CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE",
        ];
        
        let indexes = vec![
            "CREATE INDEX note_title IF NOT EXISTS FOR (n:Note) ON (n.title)",
            "CREATE INDEX note_created IF NOT EXISTS FOR (n:Note) ON (n.created)",
            "CREATE INDEX note_modified IF NOT EXISTS FOR (n:Note) ON (n.modified)",
            "CREATE INDEX note_vault IF NOT EXISTS FOR (n:Note) ON (n.vault_id)",
            "CREATE FULLTEXT INDEX note_content IF NOT EXISTS FOR (n:Note) ON EACH [n.content, n.title]",
        ];
        
        // Execute constraints
        for constraint in constraints {
            graph
                .execute(query(constraint))
                .await
                .map_err(|e| format!("Failed to create constraint: {}", e))?;
        }
        
        // Execute indexes
        for index in indexes {
            graph
                .execute(query(index))
                .await
                .map_err(|e| format!("Failed to create index: {}", e))?;
        }
        
        Ok(())
    }
    
    pub async fn create_note(&self, note: &Note) -> Result<String, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            CREATE (n:Note {
                id: $id,
                path: $path,
                title: $title,
                content: $content,
                created: $created,
                modified: $modified,
                vault_id: $vault_id
            })
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
            MATCH (n:Note {id: $id})
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
            MATCH (n:Note {id: $id})
            DETACH DELETE n
        "#;
        
        graph
            .execute(
                query(query_str)
                    .param("id", note_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to delete note: {}", e))?;
        
        Ok(())
    }
    
    pub async fn get_note(&self, note_id: &str, vault_id: &str) -> Result<Option<Note>, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MATCH (n:Note {id: $id})
            RETURN n
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("id", note_id.to_string())
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
        
        let query_str = if let Some(rel_type) = rel_type {
            format!(
                r#"
                MATCH (start:Note {{id: $id}})
                MATCH path = (start)-[:{}*1..{}]-(related:Note)
                WHERE related.id <> $id
                RETURN DISTINCT related
                ORDER BY related.modified DESC
                "#,
                rel_type, depth
            )
        } else {
            format!(
                r#"
                MATCH (start:Note {{id: $id}})
                MATCH path = (start)-[*1..{}]-(related:Note)
                WHERE related.id <> $id
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
    
    pub async fn detect_patterns(&self, pattern_type: Option<PatternType>) -> Result<Vec<Pattern>, String> {
        // TODO: Implement pattern detection algorithms
        // This is a placeholder that will be expanded with actual pattern detection logic
        Ok(vec![])
    }
    
    pub async fn get_pattern_notes(&self, pattern_id: &str) -> Result<Vec<Note>, String> {
        let graph = self.get_graph().await?;
        
        let query_str = r#"
            MATCH (p:Pattern {id: $pattern_id})<-[:FOLLOWS_PATTERN]-(n:Note)
            RETURN n
            ORDER BY n.modified DESC
        "#;
        
        let mut result = graph
            .execute(
                query(query_str)
                    .param("pattern_id", pattern_id.to_string())
            )
            .await
            .map_err(|e| format!("Failed to get pattern notes: {}", e))?;
        
        let mut notes = Vec::new();
        while let Ok(Some(row)) = result.next().await {
            let node: Node = row.get("n").map_err(|e| format!("Failed to get node: {}", e))?;
            let note = self.node_to_note(node)?;
            notes.push(note);
        }
        
        Ok(notes)
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
        
        // Ensure both nodes belong to the same vault
        let query_str = if rel.properties.is_null() || rel.properties.as_object().map_or(true, |o| o.is_empty()) {
            format!(
                r#"
                MATCH (from {{id: $from_id, vault_id: $vault_id}})
                MATCH (to {{id: $to_id, vault_id: $vault_id}})
                CREATE (from)-[r:{}]->(to)
                RETURN id(r) as rel_id
                "#,
                rel.rel_type
            )
        } else {
            format!(
                r#"
                MATCH (from {{id: $from_id, vault_id: $vault_id}})
                MATCH (to {{id: $to_id, vault_id: $vault_id}})
                CREATE (from)-[r:{} {{score: $score}}]->(to)
                RETURN id(r) as rel_id
                "#,
                rel.rel_type
            )
        };
        
        let mut q = query(&query_str)
            .param("from_id", rel.from_id.clone())
            .param("to_id", rel.to_id.clone())
            .param("vault_id", vault_id.to_string());
            
        if let Some(score) = rel.properties.get("score").and_then(|v| v.as_f64()) {
            q = q.param("score", score);
        }
        
        let mut result = graph
            .execute(q)
            .await
            .map_err(|e| format!("Failed to create relationship: {}", e))?;
        
        if let Ok(Some(row)) = result.next().await {
            let rel_id: i64 = row.get("rel_id").map_err(|e| format!("Failed to get relationship ID: {}", e))?;
            Ok(rel_id.to_string())
        } else {
            Err("Failed to create relationship: nodes not found".to_string())
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
    
    pub async fn search_notes_fulltext(&self, query: &str, vault_id: &str, limit: usize) -> Result<Vec<Note>, String> {
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
                    .param("query", query.to_string())
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
}