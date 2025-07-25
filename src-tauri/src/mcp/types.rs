use serde::{Serialize, Deserialize};
use std::collections::HashMap;

/// Server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub enabled: bool,
    pub transport: TransportType,
    pub capabilities: RequestedCapabilities,
    pub permissions: ServerPermissions,
}

impl ServerConfig {
    pub fn validate(&self) -> Result<(), anyhow::Error> {
        match &self.transport {
            TransportType::Stdio { command, .. } => {
                // Validate command is not empty
                if command.is_empty() {
                    return Err(anyhow::anyhow!("Command cannot be empty"));
                }
                Ok(())
            }
            TransportType::Http { url, .. } => {
                // Validate URL
                url.parse::<url::Url>()
                    .map_err(|e| anyhow::anyhow!("Invalid URL: {}", e))?;
                Ok(())
            }
        }
    }
}

/// Transport type configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TransportType {
    #[serde(rename = "stdio")]
    Stdio {
        command: String,
        args: Vec<String>,
        #[serde(default)]
        env: HashMap<String, String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        working_dir: Option<String>,
    },
    #[serde(rename = "http")]
    Http {
        url: String,
        headers: HashMap<String, String>,
    },
}

/// Requested capabilities from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestedCapabilities {
    pub tools: bool,
    pub resources: bool,
    pub prompts: bool,
    pub sampling: bool,
}

/// Server permissions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPermissions {
    pub read: bool,
    pub write: bool,
    pub delete: bool,
    pub external_access: bool,
}

/// Server status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status")]
pub enum ServerStatus {
    #[serde(rename = "starting")]
    Starting,
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "disconnected")]
    Disconnected,
    #[serde(rename = "stopping")]
    Stopping,
    #[serde(rename = "stopped")]
    Stopped,
    #[serde(rename = "error")]
    Error(String),
}

/// Server capabilities returned from initialization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerCapabilities {
    pub tools: Option<ToolsCapability>,
    pub resources: Option<ResourcesCapability>,
    pub prompts: Option<PromptsCapability>,
    pub sampling: Option<SamplingCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolsCapability {
    pub list_changed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcesCapability {
    pub list_changed: Option<bool>,
    pub subscribe: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptsCapability {
    pub list_changed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingCapability {}

/// JSON-RPC message types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcMessage {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<serde_json::Value>,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Initialize result from server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitializeResult {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: String,
    pub capabilities: ServerCapabilities,
    #[serde(rename = "serverInfo")]
    pub server_info: Option<ServerMetaInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetaInfo {
    pub name: String,
    pub version: String,
}

/// Server info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerInfo {
    pub id: String,
    pub status: ServerStatus,
    pub capabilities: Option<ServerCapabilities>,
    pub transport_type: String,
}

/// Events emitted to frontend
#[derive(Debug, Clone, Serialize)]
pub struct ServerConnectedEvent {
    pub server_id: String,
    pub capabilities: ServerCapabilities,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServerStoppedEvent {
    pub server_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MCPMessageEvent {
    pub server_id: String,
    pub message: serde_json::Value,
}

/// Standard JSON-RPC error codes
pub mod error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
}

/// Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

/// Resource definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Resource {
    pub uri: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "mimeType")]
    pub mime_type: Option<String>,
}

/// Prompt definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub name: String,
    pub description: Option<String>,
    pub arguments: Option<Vec<PromptArgument>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptArgument {
    pub name: String,
    pub description: Option<String>,
    pub required: Option<bool>,
}