use neo4rs::Graph;
use chrono::Utc;

pub struct SchemaManager {
    version: i32,
}

impl SchemaManager {
    pub fn new() -> Self {
        Self { version: 1 }
    }
    
    pub async fn migrate(&self, graph: &Graph) -> Result<(), String> {
        // Get current schema version
        let current_version = self.get_current_version(graph).await?;
        
        // Apply migrations
        if current_version < 1 {
            self.migrate_v1(graph).await?;
        }
        
        // Future migrations can be added here
        // if current_version < 2 {
        //     self.migrate_v2(graph).await?;
        // }
        
        Ok(())
    }
    
    async fn get_current_version(&self, graph: &Graph) -> Result<i32, String> {
        let query = neo4rs::query("MATCH (s:SchemaVersion) RETURN s.version as version");
        
        let mut result = graph
            .execute(query)
            .await
            .map_err(|e| format!("Failed to get schema version: {}", e))?;
        
        if let Ok(Some(row)) = result.next().await {
            let version: i32 = row.get("version").unwrap_or(0);
            Ok(version)
        } else {
            Ok(0) // No schema version found, assume fresh database
        }
    }
    
    async fn set_current_version(&self, graph: &Graph, version: i32) -> Result<(), String> {
        let query = neo4rs::query(
            "MERGE (s:SchemaVersion) SET s.version = $version, s.updated = $updated"
        )
        .param("version", version)
        .param("updated", Utc::now().timestamp());
        
        graph
            .execute(query)
            .await
            .map_err(|e| format!("Failed to set schema version: {}", e))?;
        
        Ok(())
    }
    
    async fn migrate_v1(&self, graph: &Graph) -> Result<(), String> {
        println!("Applying schema migration v1...");
        
        // Create constraints
        let constraints = vec![
            "CREATE CONSTRAINT note_id IF NOT EXISTS FOR (n:Note) REQUIRE n.id IS UNIQUE",
            "CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE",
            "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
            "CREATE CONSTRAINT pattern_id IF NOT EXISTS FOR (p:Pattern) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT folder_path IF NOT EXISTS FOR (f:Folder) REQUIRE f.path IS UNIQUE",
        ];
        
        for constraint in constraints {
            graph
                .execute(neo4rs::query(constraint))
                .await
                .map_err(|e| format!("Failed to create constraint: {}", e))?;
        }
        
        // Create indexes
        let indexes = vec![
            "CREATE INDEX note_title IF NOT EXISTS FOR (n:Note) ON (n.title)",
            "CREATE INDEX note_created IF NOT EXISTS FOR (n:Note) ON (n.created)",
            "CREATE INDEX note_modified IF NOT EXISTS FOR (n:Note) ON (n.modified)",
            "CREATE INDEX note_vault IF NOT EXISTS FOR (n:Note) ON (n.vault_id)",
            "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.entity_type)",
            "CREATE INDEX pattern_type IF NOT EXISTS FOR (p:Pattern) ON (p.pattern_type)",
            "CREATE FULLTEXT INDEX note_content IF NOT EXISTS FOR (n:Note) ON EACH [n.content, n.title]",
        ];
        
        for index in indexes {
            graph
                .execute(neo4rs::query(index))
                .await
                .map_err(|e| format!("Failed to create index: {}", e))?;
        }
        
        // Set version
        self.set_current_version(graph, 1).await?;
        
        println!("Schema migration v1 complete");
        Ok(())
    }
}