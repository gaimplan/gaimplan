use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc, oneshot};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt};
use anyhow::{Result, anyhow};
use serde_json;
use tauri::{AppHandle, Emitter};

use crate::mcp::types::*;
use crate::mcp::process::ProcessHandle;

/// Transport abstraction for MCP communication
pub enum Transport {
    Stdio(StdioTransport),
    Http(HttpTransport),
}

impl Transport {
    /// Create a new stdio transport
    pub async fn new_stdio(
        server_id: String,
        process_handle: ProcessHandle,
        app_handle: AppHandle,
    ) -> Result<Self> {
        println!("🔧 Creating StdioTransport instance");
        let transport = StdioTransport::new(server_id, process_handle, app_handle);
        println!("🔧 Starting transport readers...");
        transport.start_readers().await?;
        println!("✅ Transport readers started");
        Ok(Transport::Stdio(transport))
    }

    /// Create a new HTTP transport
    pub async fn new_http(url: String, headers: HashMap<String, String>) -> Result<Self> {
        let transport = HttpTransport::new(url, headers);
        Ok(Transport::Http(transport))
    }

    /// Send a JSON-RPC message and wait for response
    pub async fn send_message(&self, message: JsonRpcMessage) -> Result<JsonRpcResponse> {
        match self {
            Transport::Stdio(t) => t.send_message(message).await,
            Transport::Http(t) => t.send_message(message).await,
        }
    }

    /// Shutdown the transport
    pub async fn shutdown(&mut self) -> Result<()> {
        match self {
            Transport::Stdio(t) => t.shutdown().await,
            Transport::Http(t) => t.shutdown().await,
        }
    }
}

/// Stdio transport for local MCP servers
pub struct StdioTransport {
    server_id: String,
    process_handle: Arc<Mutex<ProcessHandle>>,
    app_handle: AppHandle,
    response_channels: Arc<Mutex<HashMap<serde_json::Value, mpsc::Sender<JsonRpcResponse>>>>,
    shutdown_tx: mpsc::Sender<()>,
}

impl StdioTransport {
    /// Create a new stdio transport
    fn new(server_id: String, process_handle: ProcessHandle, app_handle: AppHandle) -> Self {
        let (shutdown_tx, _) = mpsc::channel(1);
        
        Self {
            server_id,
            process_handle: Arc::new(Mutex::new(process_handle)),
            app_handle,
            response_channels: Arc::new(Mutex::new(HashMap::new())),
            shutdown_tx,
        }
    }

    /// Start background readers for stdout and stderr
    async fn start_readers(&self) -> Result<()> {
        println!("🔧 Starting stdout reader...");
        
        // Create channels to signal when readers are ready
        let (stdout_ready_tx, stdout_ready_rx) = tokio::sync::oneshot::channel();
        let (stderr_ready_tx, stderr_ready_rx) = tokio::sync::oneshot::channel();
        
        // Extract readers from process handle once
        let (stdout_reader, stderr_reader) = {
            let handle = self.process_handle.lock().await;
            let stdout = handle.stdout_reader.clone();
            let stderr = handle.stderr_reader.clone();
            (stdout, stderr)
        };
        
        // Start stdout reader
        let app_handle = self.app_handle.clone();
        let server_id = self.server_id.clone();
        let response_channels = self.response_channels.clone();
        
        tokio::spawn(async move {
            println!("🔧 Starting stdout reader task for {}", server_id);
            
            // Take ownership of the reader
            let mut reader = stdout_reader.lock().await;
            
            // Signal that we're ready to read
            let _ = stdout_ready_tx.send(());
            
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => {
                        println!("📥 EOF on stdout for {}", server_id);
                        break; // EOF
                    }
                    Ok(_) => {
                        // Remove trailing newline
                        let line_content = line.trim_end().to_string();
                        
                        println!("📥 Received stdout line from {}: {}", server_id, line_content);
                        
                        // Try to parse as JSON-RPC message
                        match serde_json::from_str::<serde_json::Value>(&line_content) {
                            Ok(json_value) => {
                                println!("📥 Parsed JSON from {}: {:?}", server_id, json_value);
                                
                                // Check if it's a response (has id) or notification (no id)
                                if let Some(id) = json_value.get("id") {
                                    println!("📥 Found response with ID: {:?}", id);
                                    // It's a response, check if we have a waiting channel
                                    match serde_json::from_value::<JsonRpcResponse>(json_value.clone()) {
                                        Ok(response) => {
                                            println!("📥 Parsed as JsonRpcResponse successfully");
                                            let mut channels = response_channels.lock().await;
                                            println!("📥 Current waiting channels: {:?}", channels.keys().collect::<Vec<_>>());
                                            if let Some(tx) = channels.remove(id) {
                                                println!("📥 Found channel for ID {:?}, sending response", id);
                                                if let Err(e) = tx.send(response).await {
                                                    println!("❌ Failed to send response through channel: {:?}", e);
                                                }
                                            } else {
                                                println!("❌ No waiting channel for ID: {:?}", id);
                                                println!("❌ Available channels: {:?}", channels.keys().collect::<Vec<_>>());
                                            }
                                        }
                                        Err(e) => {
                                            println!("❌ Failed to parse as JsonRpcResponse: {}", e);
                                            println!("❌ Raw JSON was: {:?}", json_value);
                                        }
                                    }
                                } else {
                                // It's a notification or request from server
                                // Emit to frontend
                                app_handle.emit(
                                    &format!("mcp-message-{}", server_id),
                                    MCPMessageEvent {
                                        server_id: server_id.clone(),
                                        message: json_value,
                                    }
                                ).ok();
                                }
                            }
                            Err(e) => {
                                println!("❌ Failed to parse JSON from {}: {}", server_id, e);
                                println!("❌ Raw line was: {}", line_content);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading stdout from {}: {}", server_id, e);
                        break;
                    }
                }
            }
        });

        // Start stderr reader
        let server_id = self.server_id.clone();
        
        tokio::spawn(async move {
            println!("🔧 Starting stderr reader task for {}", server_id);
            
            // Take ownership of the reader
            let mut reader = stderr_reader.lock().await;
            
            // Signal that we're ready to read
            let _ = stderr_ready_tx.send(());
            
            // Try to read immediately to catch startup messages
            println!("📕 Stderr reader active, attempting first read...");
            
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => {
                        println!("📕 EOF on stderr for {}", server_id);
                        break; // EOF
                    }
                    Ok(_) => {
                        let line_content = line.trim_end();
                        // Log stderr output for debugging
                        println!("📕 MCP Server {} stderr: {}", server_id, line_content);
                    }
                    Err(e) => {
                        eprintln!("❌ Error reading stderr from {}: {}", server_id, e);
                        break;
                    }
                }
            }
            println!("🔧 Stderr reader exiting for {}", server_id);
        });

        // Wait for both readers to be ready
        println!("⏳ Waiting for readers to be ready...");
        stdout_ready_rx.await.map_err(|_| anyhow!("Stdout reader failed to start"))?;
        stderr_ready_rx.await.map_err(|_| anyhow!("Stderr reader failed to start"))?;
        println!("✅ Both readers are ready");

        Ok(())
    }

    /// Send a message and wait for response
    async fn send_message(&self, message: JsonRpcMessage) -> Result<JsonRpcResponse> {
        println!("📤 StdioTransport sending message: {:?}", message);
        
        // Serialize message
        let message_str = serde_json::to_string(&message)?;
        println!("📤 Serialized message: {}", message_str);
        
        // Create response channel if this is a request (has id)
        let response_rx = if let Some(id) = &message.id {
            let (tx, rx) = mpsc::channel(1);
            println!("📥 Creating response channel for ID: {:?}", id);
            self.response_channels.lock().await.insert(id.clone(), tx);
            println!("📥 Channel inserted, waiting for response with ID: {:?}", id);
            Some(rx)
        } else {
            None
        };
        
        // Send message - use a shorter scope for the lock
        println!("📤 Getting process handle lock...");
        let write_result = {
            let handle = self.process_handle.lock().await;
            println!("📤 Got lock, writing to stdin...");
            let result = handle.write_line(&message_str).await;
            println!("📤 Write completed, releasing lock");
            result
        };
        
        write_result.map_err(|e| {
            println!("❌ Failed to write to process stdin: {}", e);
            e
        })?;
        
        println!("✅ Message sent successfully");
        
        // Wait for response if this was a request
        if let Some(mut rx) = response_rx {
            println!("📥 Waiting for response...");
            match tokio::time::timeout(
                std::time::Duration::from_secs(30),
                rx.recv()
            ).await {
                Ok(Some(response)) => {
                    println!("📥 Received response: {:?}", response);
                    Ok(response)
                },
                Ok(None) => {
                    println!("❌ Response channel closed");
                    Err(anyhow!("Response channel closed"))
                },
                Err(_) => {
                    println!("❌ Request timeout after 30s");
                    // Timeout - remove channel
                    if let Some(id) = &message.id {
                        self.response_channels.lock().await.remove(id);
                    }
                    Err(anyhow!("Request timeout"))
                }
            }
        } else {
            // Notification - no response expected
            Ok(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: serde_json::json!(null),
                result: Some(serde_json::json!(null)),
                error: None,
            })
        }
    }

    /// Shutdown the transport
    async fn shutdown(&mut self) -> Result<()> {
        // Send shutdown signal
        let _ = self.shutdown_tx.send(()).await;
        
        // Kill the process
        let handle = self.process_handle.lock().await;
        handle.kill().await?;
        
        Ok(())
    }
}

/// HTTP transport for remote MCP servers
pub struct HttpTransport {
    url: String,
    headers: HashMap<String, String>,
    client: reqwest::Client,
}

impl HttpTransport {
    /// Create a new HTTP transport
    fn new(url: String, headers: HashMap<String, String>) -> Self {
        let client = reqwest::Client::new();
        
        Self {
            url,
            headers,
            client,
        }
    }

    /// Send a message via HTTP
    async fn send_message(&self, message: JsonRpcMessage) -> Result<JsonRpcResponse> {
        // Build request
        let mut request = self.client.post(&self.url)
            .json(&message);
        
        // Add headers
        for (key, value) in &self.headers {
            request = request.header(key, value);
        }
        
        // Send request
        let response = request.send().await
            .map_err(|e| anyhow!("HTTP request failed: {}", e))?;
        
        // Check status
        if !response.status().is_success() {
            return Err(anyhow!("HTTP request failed with status: {}", response.status()));
        }
        
        // Parse response
        let json_response = response.json::<JsonRpcResponse>().await
            .map_err(|e| anyhow!("Failed to parse response: {}", e))?;
        
        Ok(json_response)
    }

    /// Shutdown the transport (no-op for HTTP)
    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }
}