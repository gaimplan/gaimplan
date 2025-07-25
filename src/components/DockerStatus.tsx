import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './DockerStatus.css';

interface DockerConfig {
  vault_id: string;
  vault_path: string;
  neo4j_password: string;
  neo4j_http_port: number;
  neo4j_bolt_port: number;
  qdrant_rest_port: number;
  qdrant_grpc_port: number;
}

interface ContainerStatus {
  name: string;
  status: string;
  health: string;
  ports: string[];
}

interface DockerStatusData {
  vault_id: string;
  neo4j: ContainerStatus | null;
  qdrant: ContainerStatus | null;
  is_running: boolean;
}

interface DockerStatusProps {
  vaultPath: string;
}

export const DockerStatus: React.FC<DockerStatusProps> = ({ vaultPath }) => {
  const [status, setStatus] = useState<DockerStatusData | null>(null);
  const [config, setConfig] = useState<DockerConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (vaultPath) {
      initializeDocker();
    }
  }, [vaultPath]);

  useEffect(() => {
    if (config) {
      const interval = setInterval(checkStatus, 5000); // Check every 5 seconds
      checkStatus(); // Check immediately
      return () => clearInterval(interval);
    }
  }, [config]);

  const initializeDocker = async () => {
    try {
      setLoading(true);
      setError(null);
      const dockerConfig = await invoke<DockerConfig>('initialize_docker', { vaultPath });
      setConfig(dockerConfig);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!config) return;
    
    try {
      const dockerStatus = await invoke<DockerStatusData>('get_docker_status', { 
        vaultId: config.vault_id 
      });
      setStatus(dockerStatus);
    } catch (err) {
      console.error('Failed to get Docker status:', err);
    }
  };

  const startContainers = async () => {
    if (!config) return;
    
    try {
      setLoading(true);
      setError(null);
      await invoke('start_docker_containers', { vaultId: config.vault_id });
      await checkStatus();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const stopContainers = async () => {
    if (!config) return;
    
    try {
      setLoading(true);
      setError(null);
      await invoke('stop_docker_containers', { vaultId: config.vault_id });
      await checkStatus();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (container: ContainerStatus | null) => {
    if (!container) return '⚫';
    if (container.health === 'healthy') return '🟢';
    if (container.status === 'running') return '🟡';
    return '🔴';
  };

  const getStatusText = (container: ContainerStatus | null) => {
    if (!container) return 'Not Found';
    if (container.health === 'healthy') return 'Healthy';
    if (container.status === 'running') return 'Starting...';
    return 'Stopped';
  };

  if (loading && !status) {
    return <div className="docker-status">Initializing Docker...</div>;
  }

  if (error) {
    return (
      <div className="docker-status docker-status-error">
        <span>Docker Error: {error}</span>
        <button onClick={initializeDocker}>Retry</button>
      </div>
    );
  }

  if (!config || !status) {
    return null;
  }

  return (
    <div className="docker-status">
      <div className="docker-status-header">
        <h3>Graph Database Status</h3>
        <div className="docker-status-controls">
          {status.is_running ? (
            <button onClick={stopContainers} disabled={loading}>
              Stop Services
            </button>
          ) : (
            <button onClick={startContainers} disabled={loading}>
              Start Services
            </button>
          )}
        </div>
      </div>
      
      <div className="docker-status-services">
        <div className="docker-service">
          <span className="service-icon">{getStatusIcon(status.neo4j)}</span>
          <div className="service-info">
            <div className="service-name">Neo4j</div>
            <div className="service-status">{getStatusText(status.neo4j)}</div>
            {status.neo4j && status.neo4j.health === 'healthy' && (
              <a 
                href={`http://localhost:${config.neo4j_http_port}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="service-link"
              >
                Open Browser →
              </a>
            )}
          </div>
        </div>
        
        <div className="docker-service">
          <span className="service-icon">{getStatusIcon(status.qdrant)}</span>
          <div className="service-info">
            <div className="service-name">Qdrant</div>
            <div className="service-status">{getStatusText(status.qdrant)}</div>
            {status.qdrant && status.qdrant.health === 'healthy' && (
              <a 
                href={`http://localhost:${config.qdrant_rest_port}/dashboard`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="service-link"
              >
                Open Dashboard →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};