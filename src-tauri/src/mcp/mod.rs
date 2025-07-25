use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::{Result, anyhow};
use tauri::{AppHandle, Emitter};

pub mod types;
pub mod process;
pub mod transport;
pub mod commands;
pub mod error;

use types::*;
use process::ProcessPool;
use transport::Transport;

/// MCP Manager - Central coordinator for all MCP operations
pub struct MCPManager {
    /// Active MCP servers indexed by server ID
    servers: Arc<RwLock<HashMap<String, MCPServer>>>,
    /// Process pool for managing server processes
    process_pool: Arc<ProcessPool>,
    /// Application handle for emitting events
    app_handle: AppHandle,
}

/// Individual MCP server instance
pub struct MCPServer {
    pub id: String,
    pub config: ServerConfig,
    pub transport: Transport,
    pub status: ServerStatus,
    pub capabilities: Option<ServerCapabilities>,
}

impl MCPManager {
    /// Create a new MCP manager instance
    pub fn new(app_handle: AppHandle) -> Result<Self> {
        Ok(Self {
            servers: Arc::new(RwLock::new(HashMap::new())),
            process_pool: Arc::new(ProcessPool::new(app_handle.clone())),
            app_handle,
        })
    }

    /// Start an MCP server with the given configuration
    pub async fn start_server(&self, server_id: String, config: ServerConfig) -> Result<()> {
        println!("🚀 Starting MCP server: {}", server_id);
        
        // Validate configuration
        config.validate()?;
        println!("✅ Configuration validated");
        
        // Check if server already exists
        if self.servers.read().await.contains_key(&server_id) {
            println!("❌ Server {} already exists", server_id);
            return Err(anyhow!("Server {} already exists", server_id));
        }
        println!("✅ Server ID available");
        
        // Create transport based on config
        println!("🔧 Creating transport...");
        let transport = match &config.transport {
            TransportType::Stdio { .. } => {
                println!("🔧 Creating stdio transport");
                // Start process via process pool
                println!("🔧 Spawning process...");
                let process_handle = self.process_pool.spawn(&config).await?;
                println!("✅ Process spawned");
                
                // Create stdio transport
                println!("🔧 Creating stdio transport wrapper...");
                Transport::new_stdio(
                    server_id.clone(),
                    process_handle,
                    self.app_handle.clone()
                ).await?
            }
            TransportType::Http { url, headers } => {
                println!("🔧 Creating HTTP transport");
                // Create HTTP transport
                Transport::new_http(url.clone(), headers.clone()).await?
            }
        };
        println!("✅ Transport created");
        
        // Create server instance
        let server = MCPServer {
            id: server_id.clone(),
            config,
            transport,
            status: ServerStatus::Starting,
            capabilities: None,
        };
        
        // Store in registry
        self.servers.write().await.insert(server_id.clone(), server);
        
        // Initialize connection
        self.initialize_server(&server_id).await?;
        
        Ok(())
    }

    /// Stop an MCP server
    pub async fn stop_server(&self, server_id: &str) -> Result<()> {
        if let Some(mut server) = self.servers.write().await.remove(server_id) {
            // Update status
            server.status = ServerStatus::Stopping;
            
            // Shutdown transport
            server.transport.shutdown().await?;
            
            // Emit stopped event
            self.app_handle.emit(
                &format!("mcp-server-stopped-{}", server_id),
                ServerStoppedEvent { server_id: server_id.to_string() }
            ).ok();
        }
        
        Ok(())
    }

    /// Send a message to an MCP server
    pub async fn send_message(&self, server_id: &str, message: JsonRpcMessage) -> Result<JsonRpcResponse> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| anyhow!("Server {} not found", server_id))?;
        
        // Check server status - allow Starting for initialization messages
        match server.status {
            ServerStatus::Connected => {},
            ServerStatus::Starting => {
                // Allow initialize messages during startup
                if message.method != "initialize" {
                    return Err(anyhow!("Server {} is still starting", server_id));
                }
            },
            ServerStatus::Stopped => return Err(anyhow!("Server {} is stopped", server_id)),
            ServerStatus::Error(ref msg) => return Err(anyhow!("Server {} has error: {}", server_id, msg)),
            _ => return Err(anyhow!("Server {} is not ready", server_id)),
        }
        
        // Send message via transport
        server.transport.send_message(message).await
    }

    /// Initialize server connection with handshake
    async fn initialize_server(&self, server_id: &str) -> Result<()> {
        // Give transport readers and server more time to fully start
        println!("⏳ Waiting for MCP server to start...");
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        
        println!("🤝 Starting MCP handshake for server: {}", server_id);
        
        // Send initialize request
        let init_request = JsonRpcMessage {
            jsonrpc: "2.0".to_string(),
            id: Some(serde_json::json!(1)),
            method: "initialize".to_string(),
            params: Some(serde_json::json!({
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "experimental": {}
                },
                "clientInfo": {
                    "name": "gaimplan",
                    "version": "0.1.0"
                }
            })),
        };
        
        println!("📤 Sending initialize request: {:?}", init_request);
        
        let response = match tokio::time::timeout(
            std::time::Duration::from_secs(10),
            self.send_message(server_id, init_request)
        ).await {
            Ok(Ok(response)) => {
                println!("📥 Received initialize response: {:?}", response);
                response
            }
            Ok(Err(e)) => {
                println!("❌ Initialize request failed: {}", e);
                return Err(e);
            }
            Err(_) => {
                println!("❌ Initialize request timed out after 10s");
                return Err(anyhow!("Initialize request timed out"));
            }
        };
        
        // Parse capabilities from response
        if let Some(result) = response.result {
            if let Ok(init_result) = serde_json::from_value::<InitializeResult>(result) {
                // Update server with capabilities
                let mut servers = self.servers.write().await;
                if let Some(server) = servers.get_mut(server_id) {
                    server.capabilities = Some(init_result.capabilities.clone());
                    server.status = ServerStatus::Connected;
                }
                
                // Emit connected event
                self.app_handle.emit(
                    &format!("mcp-server-connected-{}", server_id),
                    ServerConnectedEvent { 
                        server_id: server_id.to_string(),
                        capabilities: init_result.capabilities,
                    }
                ).ok();
            }
        }
        
        Ok(())
    }

    /// Get status of all servers
    pub async fn get_server_statuses(&self) -> HashMap<String, ServerStatus> {
        let servers = self.servers.read().await;
        servers.iter()
            .map(|(id, server)| (id.clone(), server.status.clone()))
            .collect()
    }

    /// Get server info
    pub async fn get_server_info(&self, server_id: &str) -> Result<ServerInfo> {
        let servers = self.servers.read().await;
        let server = servers.get(server_id)
            .ok_or_else(|| anyhow!("Server {} not found", server_id))?;
        
        Ok(ServerInfo {
            id: server.id.clone(),
            status: server.status.clone(),
            capabilities: server.capabilities.clone(),
            transport_type: match &server.config.transport {
                TransportType::Stdio { .. } => "stdio".to_string(),
                TransportType::Http { .. } => "http".to_string(),
            },
        })
    }
}

// Re-export for commands
pub use commands::*;