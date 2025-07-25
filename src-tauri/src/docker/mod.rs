use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::sync::Mutex;
use std::fs;
use std::sync::Arc;

pub mod shared;
pub use shared::{SharedDockerManager, SharedDockerStatus};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerConfig {
    pub vault_id: String,
    pub vault_path: PathBuf,
    pub neo4j_password: String,
    pub neo4j_http_port: u16,
    pub neo4j_bolt_port: u16,
    pub qdrant_rest_port: u16,
    pub qdrant_grpc_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerStatus {
    pub name: String,
    pub status: String,
    pub health: String,
    pub ports: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerStatus {
    pub vault_id: String,
    pub neo4j: Option<ContainerStatus>,
    pub qdrant: Option<ContainerStatus>,
    pub is_running: bool,
}

pub struct DockerManager {
    configs: Mutex<HashMap<String, DockerConfig>>,
}

impl DockerManager {
    pub fn new() -> Self {
        Self {
            configs: Mutex::new(HashMap::new()),
        }
    }

    pub async fn initialize_vault(&self, vault_path: &Path) -> Result<DockerConfig, String> {
        let vault_id = self.generate_vault_id(vault_path);
        let docker_dir = vault_path.join(".gaimplan").join("docker");
        
        // Check if already initialized
        let connection_info_path = docker_dir.join("connection-info.json");
        if connection_info_path.exists() {
            // Load existing config
            let content = fs::read_to_string(&connection_info_path)
                .map_err(|e| format!("Failed to read connection info: {}", e))?;
            let connection_info: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse connection info: {}", e))?;
            
            let config = DockerConfig {
                vault_id: vault_id.clone(),
                vault_path: vault_path.to_path_buf(),
                neo4j_password: connection_info["neo4j"]["password"].as_str().unwrap_or("").to_string(),
                neo4j_http_port: 7474,
                neo4j_bolt_port: 7687,
                qdrant_rest_port: 6333,
                qdrant_grpc_port: 6334,
            };
            
            let mut configs = self.configs.lock().await;
            configs.insert(vault_id.clone(), config.clone());
            
            return Ok(config);
        }
        
        // Initialize new vault
        let setup_script = std::env::current_dir()
            .map_err(|e| format!("Failed to get current dir: {}", e))?
            .join("scripts")
            .join("setup-vault-docker.sh");
        
        let output = Command::new("bash")
            .arg(&setup_script)
            .arg(vault_path)
            .output()
            .map_err(|e| format!("Failed to run setup script: {}", e))?;
        
        if !output.status.success() {
            return Err(format!("Setup script failed: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        // Now load the newly created config (non-recursive)
        let content = fs::read_to_string(&connection_info_path)
            .map_err(|e| format!("Failed to read newly created connection info: {}", e))?;
        let connection_info: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse newly created connection info: {}", e))?;
        
        let config = DockerConfig {
            vault_id: vault_id.clone(),
            vault_path: vault_path.to_path_buf(),
            neo4j_password: connection_info["neo4j"]["password"].as_str().unwrap_or("").to_string(),
            neo4j_http_port: 7474,
            neo4j_bolt_port: 7687,
            qdrant_rest_port: 6333,
            qdrant_grpc_port: 6334,
        };
        
        let mut configs = self.configs.lock().await;
        configs.insert(vault_id.clone(), config.clone());
        
        Ok(config)
    }

    pub async fn start_containers(&self, vault_id: &str) -> Result<(), String> {
        let configs = self.configs.lock().await;
        let config = configs.get(vault_id)
            .ok_or_else(|| "Vault not initialized".to_string())?;
        
        let docker_dir = config.vault_path.join(".gaimplan").join("docker");
        let start_script = docker_dir.join("start.sh");
        
        let output = Command::new("bash")
            .arg(&start_script)
            .current_dir(&docker_dir)
            .output()
            .map_err(|e| format!("Failed to start containers: {}", e))?;
        
        if !output.status.success() {
            return Err(format!("Failed to start containers: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        Ok(())
    }

    pub async fn stop_containers(&self, vault_id: &str) -> Result<(), String> {
        let configs = self.configs.lock().await;
        let config = configs.get(vault_id)
            .ok_or_else(|| "Vault not initialized".to_string())?;
        
        let docker_dir = config.vault_path.join(".gaimplan").join("docker");
        let stop_script = docker_dir.join("stop.sh");
        
        let output = Command::new("bash")
            .arg(&stop_script)
            .current_dir(&docker_dir)
            .output()
            .map_err(|e| format!("Failed to stop containers: {}", e))?;
        
        if !output.status.success() {
            return Err(format!("Failed to stop containers: {}", String::from_utf8_lossy(&output.stderr)));
        }
        
        Ok(())
    }

    pub async fn get_status(&self, vault_id: &str) -> Result<DockerStatus, String> {
        let configs = self.configs.lock().await;
        let _config = configs.get(vault_id)
            .ok_or_else(|| "Vault not initialized".to_string())?;
        
        let neo4j_name = format!("gaimplan-neo4j-{}", vault_id);
        let qdrant_name = format!("gaimplan-qdrant-{}", vault_id);
        
        // Check Neo4j status
        let neo4j_status = self.get_container_status(&neo4j_name).await;
        let qdrant_status = self.get_container_status(&qdrant_name).await;
        
        let is_running = neo4j_status.is_some() && qdrant_status.is_some();
        
        Ok(DockerStatus {
            vault_id: vault_id.to_string(),
            neo4j: neo4j_status,
            qdrant: qdrant_status,
            is_running,
        })
    }

    async fn get_container_status(&self, container_name: &str) -> Option<ContainerStatus> {
        let output = Command::new("docker")
            .args(&["inspect", container_name, "--format", "{{json .}}"])
            .output()
            .ok()?;
        
        if !output.status.success() {
            return None;
        }
        
        let inspect_data: serde_json::Value = serde_json::from_slice(&output.stdout).ok()?;
        
        // Parse port mappings
        let mut ports = Vec::new();
        if let Some(port_bindings) = inspect_data["HostConfig"]["PortBindings"].as_object() {
            for (container_port, host_bindings) in port_bindings {
                if let Some(bindings) = host_bindings.as_array() {
                    for binding in bindings {
                        if let Some(host_port) = binding["HostPort"].as_str() {
                            ports.push(format!("{} -> {}", host_port, container_port));
                        }
                    }
                }
            }
        }
        
        // Determine health status
        let health = if let Some(health_obj) = inspect_data["State"]["Health"].as_object() {
            health_obj["Status"].as_str().unwrap_or("none").to_string()
        } else if inspect_data["State"]["Running"].as_bool().unwrap_or(false) {
            // If no health check defined but container is running, consider it "running"
            "running".to_string()
        } else {
            "none".to_string()
        };
        
        Some(ContainerStatus {
            name: container_name.to_string(),
            status: inspect_data["State"]["Status"].as_str().unwrap_or("unknown").to_string(),
            health,
            ports,
        })
    }
    
    pub async fn wait_for_healthy(&self, vault_id: &str, timeout_secs: u64) -> Result<(), String> {
        use std::time::{Duration, Instant};
        
        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs);
        
        loop {
            if start.elapsed() > timeout {
                return Err("Timeout waiting for containers to be healthy".to_string());
            }
            
            let status = self.get_status(vault_id).await?;
            
            let neo4j_healthy = status.neo4j
                .as_ref()
                .map(|s| s.health == "healthy" || s.health == "running")
                .unwrap_or(false);
                
            let qdrant_healthy = status.qdrant
                .as_ref()
                .map(|s| s.health == "healthy" || s.health == "running")
                .unwrap_or(false);
            
            if neo4j_healthy && qdrant_healthy {
                return Ok(());
            }
            
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    }

    fn generate_vault_id(&self, vault_path: &Path) -> String {
        crate::vault_id::generate_vault_id(vault_path)
    }
}

// Tauri commands
#[tauri::command]
pub async fn initialize_docker(
    docker_manager: State<'_, Arc<DockerManager>>,
    vault_path: String,
) -> Result<DockerConfig, String> {
    docker_manager.initialize_vault(Path::new(&vault_path)).await
}

#[tauri::command]
pub async fn start_docker_containers(
    docker_manager: State<'_, Arc<DockerManager>>,
    vault_id: String,
) -> Result<(), String> {
    docker_manager.start_containers(&vault_id).await
}

#[tauri::command]
pub async fn stop_docker_containers(
    docker_manager: State<'_, Arc<DockerManager>>,
    vault_id: String,
) -> Result<(), String> {
    docker_manager.stop_containers(&vault_id).await
}

#[tauri::command]
pub async fn get_docker_status(
    docker_manager: State<'_, Arc<DockerManager>>,
    vault_id: String,
) -> Result<DockerStatus, String> {
    docker_manager.get_status(&vault_id).await
}

#[tauri::command]
pub async fn wait_for_docker_healthy(
    docker_manager: State<'_, Arc<DockerManager>>,
    vault_id: String,
    timeout_secs: Option<u64>,
) -> Result<(), String> {
    docker_manager.wait_for_healthy(&vault_id, timeout_secs.unwrap_or(60)).await
}