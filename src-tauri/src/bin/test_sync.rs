use std::env;
use std::sync::Arc;
use std::path::PathBuf;
use gaimplan_dev::vault::Vault;
use gaimplan_dev::graph::{GraphManagerImpl, GraphManagerTrait, GraphConfig};
use gaimplan_dev::graph::sync::GraphSyncService;
use gaimplan_dev::docker::SharedDockerManager;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file
    dotenvy::dotenv().ok();
    
    println!("=== Graph Sync Test Harness ===\n");
    
    // Get vault path from environment or use default
    let vault_path = env::var("VAULT_PATH")
        .unwrap_or_else(|_| "/Users/ksnyder/neo4j/data".to_string());
    
    println!("📁 Vault path: {}", vault_path);
    
    // Create vault instance
    println!("📂 Creating vault instance...");
    let vault = Arc::new(Vault::new(PathBuf::from(vault_path.clone()))?);
    let vault_name = PathBuf::from(&vault_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("default")
        .to_string();
    
    // Ensure Docker services are running
    println!("🐳 Checking Docker services...");
    let docker_manager = SharedDockerManager::new();
    docker_manager.ensure_started().await?;
    
    // Get connection info
    println!("🔌 Getting connection info...");
    let conn_info = docker_manager.get_connection_info(&vault_name).await?;
    
    // Create graph manager
    println!("📊 Creating graph manager...");
    let graph_manager: Arc<dyn GraphManagerTrait> = Arc::new(GraphManagerImpl::new(conn_info.vault_id.clone()));
    
    // Configure graph connection
    let config = GraphConfig {
        vault_id: conn_info.vault_id.clone(),
        vault_path: vault_path.clone(),
        neo4j_uri: conn_info.neo4j.uri.clone(),
        neo4j_user: conn_info.neo4j.username.clone(),
        neo4j_password: conn_info.neo4j.password.clone(),
        qdrant_url: conn_info.qdrant.rest_url.clone(),
    };
    
    println!("🔗 Connecting to graph databases...");
    println!("   Neo4j: {}", config.neo4j_uri);
    println!("   Qdrant: {}", config.qdrant_url);
    
    graph_manager.connect(&config).await?;
    println!("✅ Connected to graph databases");
    
    // Create sync service
    println!("\n🔄 Creating sync service...");
    let sync_service = GraphSyncService::new(graph_manager.clone(), vault.clone());
    
    // Run initial sync
    println!("🚀 Starting initial sync...");
    println!("   This may take a few minutes depending on vault size...\n");
    
    let start_time = std::time::Instant::now();
    
    match sync_service.initial_sync().await {
        Ok(()) => {
            let duration = start_time.elapsed();
            println!("\n✅ Sync completed successfully!");
            println!("⏱️  Duration: {:.2} seconds", duration.as_secs_f64());
            
            // Try to get some stats (placeholder for now)
            println!("\n📊 Stats:");
            println!("   Nodes created: Check Neo4j browser");
            println!("   Relationships created: Check Neo4j browser");
            
            // Show where to check results
            println!("\n🌐 Check results at:");
            println!("   Neo4j Browser: http://localhost:7474");
            println!("   Username: neo4j");
            println!("   Password: {} (from .env)", env::var("NEO4J_PASSWORD").unwrap_or_else(|_| "********".to_string()));
        }
        Err(e) => {
            println!("\n❌ Sync failed: {}", e);
            println!("⏱️  Failed after: {:.2} seconds", start_time.elapsed().as_secs_f64());
        }
    }
    
    println!("\n=== Test Complete ===");
    
    Ok(())
}