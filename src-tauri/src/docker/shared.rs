use std::process::Command;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use dirs::home_dir;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct SharedDockerStatus {
    pub neo4j_running: bool,
    pub qdrant_running: bool,
    pub neo4j_healthy: bool,
    pub qdrant_healthy: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionInfo {
    #[serde(rename = "vaultId")]
    pub vault_id: String,
    pub neo4j: Neo4jInfo,
    pub qdrant: QdrantInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Neo4jInfo {
    pub uri: String,
    pub username: String,
    pub password: String,
    #[serde(rename = "httpUrl")]
    pub http_url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QdrantInfo {
    #[serde(rename = "restUrl")]
    pub rest_url: String,
    #[serde(rename = "grpcUrl")]
    pub grpc_url: String,
}

pub struct SharedDockerManager;

impl SharedDockerManager {
    pub fn new() -> Self {
        Self
    }
    
    pub fn get_shared_docker_path() -> PathBuf {
        home_dir()
            .expect("Could not find home directory")
            .join(".gaimplan")
            .join("docker")
    }
    
    pub async fn ensure_started(&self) -> Result<(), String> {
        let status = self.get_status().await?;
        
        if !status.neo4j_running || !status.qdrant_running {
            self.start_containers().await?;
        }
        
        Ok(())
    }
    
    pub async fn start_containers(&self) -> Result<(), String> {
        let docker_path = Self::get_shared_docker_path();
        
        let output = Command::new("sh")
            .current_dir(&docker_path)
            .arg("-c")
            .arg("docker compose up -d")
            .output()
            .map_err(|e| format!("Failed to start containers: {}", e))?;
            
        if !output.status.success() {
            return Err(format!(
                "Failed to start containers: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        // Wait for services to be ready
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        
        Ok(())
    }
    
    pub async fn stop_containers(&self) -> Result<(), String> {
        let docker_path = Self::get_shared_docker_path();
        
        let output = Command::new("sh")
            .current_dir(&docker_path)
            .arg("-c")
            .arg("docker compose down")
            .output()
            .map_err(|e| format!("Failed to stop containers: {}", e))?;
            
        if !output.status.success() {
            return Err(format!(
                "Failed to stop containers: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
        
        Ok(())
    }
    
    pub async fn get_status(&self) -> Result<SharedDockerStatus, String> {
        let output = Command::new("docker")
            .args(&["ps", "--format", "json"])
            .output()
            .map_err(|e| format!("Failed to check docker status: {}", e))?;
            
        if !output.status.success() {
            return Ok(SharedDockerStatus {
                neo4j_running: false,
                qdrant_running: false,
                neo4j_healthy: false,
                qdrant_healthy: false,
            });
        }
        
        let output_str = String::from_utf8_lossy(&output.stdout);
        let neo4j_running = output_str.contains("gaimplan-neo4j-shared");
        let qdrant_running = output_str.contains("gaimplan-qdrant-shared");
        
        // Check health status
        let neo4j_healthy = if neo4j_running {
            self.check_neo4j_health().await
        } else {
            false
        };
        
        let qdrant_healthy = if qdrant_running {
            self.check_qdrant_health().await
        } else {
            false
        };
        
        Ok(SharedDockerStatus {
            neo4j_running,
            qdrant_running,
            neo4j_healthy,
            qdrant_healthy,
        })
    }
    
    async fn check_neo4j_health(&self) -> bool {
        let output = Command::new("curl")
            .args(&["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:7474"])
            .output()
            .ok();
            
        output
            .map(|o| String::from_utf8_lossy(&o.stdout) == "200")
            .unwrap_or(false)
    }
    
    async fn check_qdrant_health(&self) -> bool {
        let output = Command::new("curl")
            .args(&["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:6333/"])
            .output()
            .ok();
            
        output
            .map(|o| String::from_utf8_lossy(&o.stdout) == "200")
            .unwrap_or(false)
    }
    
    pub async fn get_connection_info(&self, vault_name: &str) -> Result<ConnectionInfo, String> {
        // Try to read from environment variable first
        let neo4j_password = match std::env::var("NEO4J_PASSWORD") {
            Ok(password) => password,
            Err(_) => {
                // Fall back to reading from .env file
                let env_path = std::env::current_dir()
                    .map_err(|e| format!("Failed to get current directory: {}", e))?
                    .join(".env");
                
                if env_path.exists() {
                    let env_content = fs::read_to_string(&env_path)
                        .map_err(|e| format!("Failed to read .env file: {}", e))?;
                    
                    let mut password = None;
                    for line in env_content.lines() {
                        if line.starts_with("NEO4J_PASSWORD=") {
                            password = Some(line.trim_start_matches("NEO4J_PASSWORD=").to_string());
                            break;
                        }
                    }
                    
                    password.ok_or_else(|| "NEO4J_PASSWORD not found in .env file".to_string())?
                } else {
                    return Err("NEO4J_PASSWORD not set in environment and .env file not found".to_string());
                }
            }
        };
        
        println!("Using Neo4j password from environment/file");
        
        // Generate vault_id consistently using the vault name
        let vault_id = vault_name;
        
        Ok(ConnectionInfo {
            vault_id: vault_id.to_string(),
            neo4j: Neo4jInfo {
                uri: "bolt://localhost:7687".to_string(),
                username: "neo4j".to_string(),
                password: neo4j_password,
                http_url: "http://localhost:7474".to_string(),
            },
            qdrant: QdrantInfo {
                rest_url: "http://localhost:6333".to_string(),
                grpc_url: "http://localhost:6334".to_string(),
            },
        })
    }
}