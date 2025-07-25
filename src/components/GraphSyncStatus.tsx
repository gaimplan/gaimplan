import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import './GraphSyncStatus.css';

interface GraphSyncStatusData {
  enabled: boolean;
  lastSync: string | null;
  pendingUpdates: number;
  syncErrors: number;
}

interface SyncEvent {
  file: string;
  success?: boolean;
  error?: string;
}

export const GraphSyncStatus: React.FC = () => {
  const [status, setStatus] = useState<GraphSyncStatusData | null>(null);
  const [syncingFile, setSyncingFile] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    // Initial status fetch
    fetchStatus();

    // Set up event listeners
    const unlistenStarted = listen<SyncEvent>('graph:sync:started', (event) => {
      setSyncingFile(event.payload.file);
      setLastError(null);
    });

    const unlistenCompleted = listen<SyncEvent>('graph:sync:completed', (event) => {
      setSyncingFile(null);
      // Refresh status after sync
      fetchStatus();
    });

    const unlistenError = listen<SyncEvent>('graph:sync:error', (event) => {
      setSyncingFile(null);
      setLastError(event.payload.error || 'Unknown error');
      // Refresh status to update error count
      fetchStatus();
    });

    // Refresh status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => {
      interval && clearInterval(interval);
      unlistenStarted.then(fn => fn());
      unlistenCompleted.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const result = await invoke<GraphSyncStatusData>('graph_sync_status');
      setStatus(result);
    } catch (error) {
      console.error('Failed to fetch graph sync status:', error);
    }
  };

  const toggleSync = async () => {
    try {
      await invoke('graph_enable_sync', { enabled: !status?.enabled });
      await fetchStatus();
    } catch (error) {
      console.error('Failed to toggle graph sync:', error);
      setLastError(error.toString());
    }
  };

  if (!status) {
    return null;
  }

  return (
    <div className="graph-sync-status">
      <div className="sync-status-header">
        <span className="sync-status-label">Graph Sync</span>
        <button 
          className={`sync-toggle ${status.enabled ? 'enabled' : 'disabled'}`}
          onClick={toggleSync}
          title={status.enabled ? 'Disable graph sync' : 'Enable graph sync'}
        >
          {status.enabled ? '🟢' : '⚫'}
        </button>
      </div>
      
      {syncingFile && (
        <div className="sync-progress">
          <span className="sync-spinner">🔄</span>
          <span className="sync-file">{syncingFile}</span>
        </div>
      )}
      
      {lastError && (
        <div className="sync-error">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{lastError}</span>
        </div>
      )}
      
      {status.enabled && (
        <div className="sync-stats">
          {status.pendingUpdates > 0 && (
            <span className="pending-count" title="Pending updates">
              📝 {status.pendingUpdates}
            </span>
          )}
          {status.syncErrors > 0 && (
            <span className="error-count" title="Sync errors">
              ❌ {status.syncErrors}
            </span>
          )}
        </div>
      )}
    </div>
  );
};