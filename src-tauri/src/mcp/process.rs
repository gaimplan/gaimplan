use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::{Command, Child, ChildStdin, ChildStdout, ChildStderr};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use anyhow::{Result, anyhow};
use std::process::Stdio;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::mcp::types::*;

/// Maximum number of concurrent MCP server processes
const MAX_PROCESSES: usize = 5;

/// Process pool for managing MCP server processes
pub struct ProcessPool {
    /// Active processes indexed by server ID
    active_processes: Arc<Mutex<HashMap<String, ProcessHandle>>>,
    /// Maximum number of processes allowed
    max_processes: usize,
    /// App handle for resolving resource paths
    app_handle: AppHandle,
}

/// Handle to a running MCP server process
pub struct ProcessHandle {
    pub child: Arc<Mutex<Child>>,
    pub stdin: Arc<Mutex<ChildStdin>>,
    pub stdout_reader: Arc<Mutex<BufReader<ChildStdout>>>,
    pub stderr_reader: Arc<Mutex<BufReader<ChildStderr>>>,
}

impl ProcessPool {
    /// Create a new process pool
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            active_processes: Arc::new(Mutex::new(HashMap::new())),
            max_processes: MAX_PROCESSES,
            app_handle,
        }
    }

    /// Spawn a new MCP server process
    pub async fn spawn(&self, config: &ServerConfig) -> Result<ProcessHandle> {
        println!("🔧 ProcessPool::spawn called");
        
        // Check resource limits
        self.check_limits().await?;
        println!("✅ Process limits checked");
        
        // Extract stdio config
        let (command, args, env, working_dir) = match &config.transport {
            TransportType::Stdio { command, args, env, working_dir } => {
                println!("✅ Extracted stdio config: {} {:?}", command, args);
                (command.clone(), args.clone(), env.clone(), working_dir.clone())
            }
            _ => return Err(anyhow!("Process pool only supports stdio transport")),
        };
        
        // Build command
        let mut cmd = Command::new(&command);
        cmd.args(&args);
        
        // Set environment variables
        for (key, value) in &env {
            println!("🔧 Setting env var: {}={}", key, value);
            
            // Special validation for VAULT_PATH
            if key == "VAULT_PATH" {
                if let Err(e) = self.validate_vault_path(value) {
                    return Err(anyhow!("Invalid vault path '{}': {}", value, e));
                }
            }
            
            cmd.env(key, value);
        }
        
        // Set working directory if specified, otherwise use original logic temporarily
        let final_working_dir = if let Some(cwd) = working_dir {
            println!("🔧 Using specified working directory: {:?}", cwd);
            cmd.current_dir(&cwd);
            cwd.clone()
        } else {
            // TEMPORARY: Use the original working directory logic to see if this fixes the issue
            if let Ok(current_dir) = std::env::current_dir() {
                if current_dir.file_name().and_then(|s| s.to_str()) == Some("src-tauri") {
                    if let Some(parent) = current_dir.parent() {
                        println!("🔧 Using original logic - setting working directory to parent: {:?}", parent);
                        cmd.current_dir(parent);
                        parent.to_string_lossy().to_string()
                    } else {
                        // Fallback to app resource directory
                        let resolved_dir = self.get_app_resource_dir().unwrap_or_else(|| {
                            std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                        });
                        println!("🔧 Setting working directory to: {:?}", resolved_dir);
                        cmd.current_dir(&resolved_dir);
                        resolved_dir.to_string_lossy().to_string()
                    }
                } else {
                    // Not in src-tauri, use app resource directory
                    let resolved_dir = self.get_app_resource_dir().unwrap_or_else(|| {
                        std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
                    });
                    println!("🔧 Setting working directory to: {:?}", resolved_dir);
                    cmd.current_dir(&resolved_dir);
                    resolved_dir.to_string_lossy().to_string()
                }
            } else {
                // Can't get current directory, use app resource directory
                let resolved_dir = self.get_app_resource_dir().unwrap_or_else(|| {
                    PathBuf::from(".")
                });
                println!("🔧 Setting working directory to: {:?}", resolved_dir);
                cmd.current_dir(&resolved_dir);
                resolved_dir.to_string_lossy().to_string()
            }
        };
        
        // Configure process pipes
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Debug: Show final command and working directory
        println!("🚀 Executing command: {} {:?}", command, args);
        println!("🔧 Final working directory: {:?}", final_working_dir);
        
        // Kill process when parent dies (platform-specific)
        #[cfg(unix)]
        {
            unsafe {
                cmd.pre_exec(|| {
                    // Set process group
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }
        
        // Spawn process
        println!("🚀 Spawning process: {} {:?}", command, args);
        let mut child = cmd.spawn()
            .map_err(|e| anyhow!("Failed to spawn process: {}", e))?;
        println!("✅ Process spawned with PID: {:?}", child.id());
        
        // Extract handles
        let stdin = child.stdin.take()
            .ok_or_else(|| anyhow!("Failed to get stdin handle"))?;
        let stdout = BufReader::new(
            child.stdout.take()
                .ok_or_else(|| anyhow!("Failed to get stdout handle"))?
        );
        let stderr = BufReader::new(
            child.stderr.take()
                .ok_or_else(|| anyhow!("Failed to get stderr handle"))?
        );
        
        Ok(ProcessHandle {
            child: Arc::new(Mutex::new(child)),
            stdin: Arc::new(Mutex::new(stdin)),
            stdout_reader: Arc::new(Mutex::new(stdout)),
            stderr_reader: Arc::new(Mutex::new(stderr)),
        })
    }

    /// Check if we can spawn more processes
    async fn check_limits(&self) -> Result<()> {
        let processes = self.active_processes.lock().await;
        if processes.len() >= self.max_processes {
            return Err(anyhow!(
                "Process limit reached. Maximum {} processes allowed",
                self.max_processes
            ));
        }
        Ok(())
    }

    /// Store a process handle
    pub async fn register(&self, server_id: String, handle: ProcessHandle) {
        self.active_processes.lock().await.insert(server_id, handle);
    }

    /// Remove a process handle
    pub async fn unregister(&self, server_id: &str) -> Option<ProcessHandle> {
        self.active_processes.lock().await.remove(server_id)
    }

    /// Get active process count
    pub async fn active_count(&self) -> usize {
        self.active_processes.lock().await.len()
    }

    /// Cleanup all processes
    pub async fn cleanup_all(&self) -> Result<()> {
        let mut processes = self.active_processes.lock().await;
        
        for (server_id, handle) in processes.drain() {
            // Try graceful shutdown first
            if let Err(e) = handle.kill().await {
                eprintln!("Error killing process for {}: {}", server_id, e);
            }
        }
        
        Ok(())
    }

    /// Get the app's resource directory for resolving relative paths
    fn get_app_resource_dir(&self) -> Option<PathBuf> {
        // Debug: Show current directory
        if let Ok(current_dir) = std::env::current_dir() {
            println!("🔧 Current directory: {:?}", current_dir);
        }
        
        // Try to get the resource directory from the app handle
        // This works for both development and production builds
        match self.app_handle.path().resource_dir() {
            Ok(path) => {
                println!("🔧 App resource directory: {:?}", path);
                // Check if this path exists
                if path.exists() {
                    println!("✅ App resource directory exists");
                    return Some(path);
                } else {
                    println!("❌ App resource directory does not exist");
                }
            }
            Err(e) => {
                println!("❌ Failed to get app resource directory: {}", e);
            }
        }
        
        // Fallback: try to detect if we're in development and use parent directory
        if let Ok(current_dir) = std::env::current_dir() {
            println!("🔧 Checking if current directory is src-tauri: {:?}", current_dir);
            if current_dir.file_name().and_then(|s| s.to_str()) == Some("src-tauri") {
                if let Some(parent) = current_dir.parent() {
                    println!("🔧 Development mode: using parent directory: {:?}", parent);
                    return Some(parent.to_path_buf());
                }
            }
        }
        
        println!("⚠️  Could not determine app resource directory, using current directory");
        None
    }
    
    /// Validate that a vault path exists and is accessible
    fn validate_vault_path(&self, path_str: &str) -> Result<()> {
        let path = PathBuf::from(path_str);
        
        // Check if path exists
        if !path.exists() {
            return Err(anyhow!("Vault path does not exist"));
        }
        
        // Check if path is a directory
        if !path.is_dir() {
            return Err(anyhow!("Vault path is not a directory"));
        }
        
        // Check if path is readable
        match std::fs::read_dir(&path) {
            Ok(_) => {
                println!("✅ Vault path validated: {}", path_str);
                Ok(())
            }
            Err(e) => Err(anyhow!("Cannot read vault directory: {}", e))
        }
    }
}

impl ProcessHandle {
    /// Write a line to the process stdin
    pub async fn write_line(&self, line: &str) -> Result<()> {
        println!("📝 Writing to stdin: {}", line);
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await
            .map_err(|e| {
                eprintln!("❌ Failed to write line: {}", e);
                anyhow!("Failed to write to stdin: {}", e)
            })?;
        stdin.write_all(b"\n").await
            .map_err(|e| {
                eprintln!("❌ Failed to write newline: {}", e);
                anyhow!("Failed to write newline: {}", e)
            })?;
        stdin.flush().await
            .map_err(|e| {
                eprintln!("❌ Failed to flush stdin: {}", e);
                anyhow!("Failed to flush stdin: {}", e)
            })?;
        println!("✅ Successfully wrote to stdin and flushed");
        Ok(())
    }

    /// Read a line from stdout
    pub async fn read_stdout_line(&self) -> Result<Option<String>> {
        let mut reader = self.stdout_reader.lock().await;
        let mut line = String::new();
        
        match reader.read_line(&mut line).await {
            Ok(0) => Ok(None), // EOF
            Ok(_) => {
                // Remove trailing newline
                if line.ends_with('\n') {
                    line.pop();
                    if line.ends_with('\r') {
                        line.pop();
                    }
                }
                Ok(Some(line))
            }
            Err(e) => Err(anyhow!("Error reading stdout: {}", e)),
        }
    }

    /// Read a line from stderr
    pub async fn read_stderr_line(&self) -> Result<Option<String>> {
        let mut reader = self.stderr_reader.lock().await;
        let mut line = String::new();
        
        match reader.read_line(&mut line).await {
            Ok(0) => Ok(None), // EOF
            Ok(_) => {
                // Remove trailing newline
                if line.ends_with('\n') {
                    line.pop();
                    if line.ends_with('\r') {
                        line.pop();
                    }
                }
                Ok(Some(line))
            }
            Err(e) => Err(anyhow!("Error reading stderr: {}", e)),
        }
    }

    /// Check if process is still running
    pub async fn is_running(&self) -> bool {
        let mut child = self.child.lock().await;
        match child.try_wait() {
            Ok(Some(_)) => false, // Process has exited
            Ok(None) => true,     // Still running
            Err(_) => false,      // Error checking status
        }
    }

    /// Kill the process
    pub async fn kill(&self) -> Result<()> {
        let mut child = self.child.lock().await;
        child.kill().await
            .map_err(|e| anyhow!("Failed to kill process: {}", e))
    }
}

// Cleanup processes on drop
impl Drop for ProcessPool {
    fn drop(&mut self) {
        // Note: We can't do async cleanup in drop, so we rely on
        // explicit cleanup or OS process cleanup
    }
}