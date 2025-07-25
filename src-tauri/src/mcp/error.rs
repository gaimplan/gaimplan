use thiserror::Error;

/// MCP-specific errors
#[derive(Error, Debug)]
pub enum MCPError {
    #[error("Server not found: {0}")]
    ServerNotFound(String),
    
    #[error("Server already exists: {0}")]
    ServerAlreadyExists(String),
    
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),
    
    #[error("Process error: {0}")]
    ProcessError(String),
    
    #[error("Transport error: {0}")]
    TransportError(String),
    
    #[error("Protocol error: {0}")]
    ProtocolError(String),
    
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    
    #[error("Timeout: {0}")]
    Timeout(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
    
    #[error("Other error: {0}")]
    Other(#[from] anyhow::Error),
}

impl From<MCPError> for String {
    fn from(error: MCPError) -> Self {
        error.to_string()
    }
}