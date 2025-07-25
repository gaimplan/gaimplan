// GraphSyncStatus component integration for vanilla JS
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export class GraphSyncStatus {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.status = null;
    this.syncingFile = null;
    this.lastError = null;
    this.unlisteners = [];
    
    if (!this.container) {
      console.error(`Container ${containerId} not found`);
      return;
    }
    
    this.init();
  }
  
  async init() {
    // Initial render
    this.render();
    
    // Set up event listeners
    const unlistenStarted = await listen('graph:sync:started', (event) => {
      this.syncingFile = event.payload.file;
      this.lastError = null;
      this.render();
    });
    
    const unlistenCompleted = await listen('graph:sync:completed', (event) => {
      this.syncingFile = null;
      this.fetchStatus();
    });
    
    const unlistenError = await listen('graph:sync:error', (event) => {
      this.syncingFile = null;
      this.lastError = event.payload.error || 'Unknown error';
      this.fetchStatus();
    });
    
    this.unlisteners.push(unlistenStarted, unlistenCompleted, unlistenError);
    
    // Initial status fetch
    await this.fetchStatus();
    
    // Refresh status every 10 seconds
    this.interval = setInterval(() => this.fetchStatus(), 10000);
  }
  
  async fetchStatus() {
    try {
      this.status = await invoke('graph_sync_status');
      this.render();
    } catch (error) {
      console.error('Failed to fetch graph sync status:', error);
    }
  }
  
  async toggleSync() {
    try {
      await invoke('graph_enable_sync', { enabled: !this.status?.enabled });
      await this.fetchStatus();
    } catch (error) {
      console.error('Failed to toggle graph sync:', error);
      this.lastError = error.toString();
      this.render();
    }
  }
  
  render() {
    if (!this.container) return;
    
    if (!this.status) {
      this.container.innerHTML = '';
      return;
    }
    
    let html = `
      <div class="graph-sync-status">
        <div class="sync-status-header">
          <span class="sync-status-label">Graph Sync</span>
          <button 
            class="sync-toggle ${this.status.enabled ? 'enabled' : 'disabled'}"
            title="${this.status.enabled ? 'Disable graph sync' : 'Enable graph sync'}"
          >
            ${this.status.enabled ? '🟢' : '⚫'}
          </button>
        </div>
    `;
    
    if (this.syncingFile) {
      html += `
        <div class="sync-progress">
          <span class="sync-spinner">🔄</span>
          <span class="sync-file">${this.syncingFile}</span>
        </div>
      `;
    }
    
    if (this.lastError) {
      html += `
        <div class="sync-error">
          <span class="error-icon">⚠️</span>
          <span class="error-message">${this.lastError}</span>
        </div>
      `;
    }
    
    if (this.status.enabled) {
      html += '<div class="sync-stats">';
      
      if (this.status.pendingUpdates > 0) {
        html += `
          <span class="pending-count" title="Pending updates">
            📝 ${this.status.pendingUpdates}
          </span>
        `;
      }
      
      if (this.status.syncErrors > 0) {
        html += `
          <span class="error-count" title="Sync errors">
            ❌ ${this.status.syncErrors}
          </span>
        `;
      }
      
      html += '</div>';
    }
    
    html += '</div>';
    
    this.container.innerHTML = html;
    
    // Add click handler to toggle button
    const toggleBtn = this.container.querySelector('.sync-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = () => this.toggleSync();
    }
  }
  
  destroy() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    
    this.unlisteners.forEach(fn => fn());
    this.unlisteners = [];
    
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// Auto-initialize when DOM is ready
let graphSyncStatus = null;

export function initGraphSyncStatus() {
  if (!graphSyncStatus) {
    graphSyncStatus = new GraphSyncStatus('graph-sync-status-container');
    window.graphSyncStatus = graphSyncStatus; // Expose for debugging
  }
}

// Clean up on window unload
window.addEventListener('beforeunload', () => {
  if (graphSyncStatus) {
    graphSyncStatus.destroy();
  }
});