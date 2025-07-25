import { invoke } from '@tauri-apps/api/core';
import { mcpManager } from './MCPManager.js';
import { serverConfigDialog } from './ServerConfigDialog.js';
import { bundledServers, getBundledServers, shouldInstallBundledServers } from './bundledServers.js';

/**
 * MCP Settings Panel Component
 * Manages MCP server configurations and status
 */
export class MCPSettingsPanel {
  constructor() {
    this.container = null;
    this.servers = new Map();
    this.serverCapabilities = new Map(); // Store tools and resources count
    this.isVisible = false;
    
    // Bind methods
    this.hide = this.hide.bind(this);
    this.show = this.show.bind(this);
    this.toggle = this.toggle.bind(this);
  }

  /**
   * Mount the settings panel to a container
   * @param {HTMLElement} container - Container element
   */
  async mount(container) {
    this.container = container;
    this.render();
    
    // Force update Qdrant config before loading
    await this.forceUpdateQdrantConfig();
    
    // Load existing server configurations
    await this.loadServers();
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Listen for server status changes
    mcpManager.on('status-change', (event) => {
      console.log(`[MCPSettingsPanel] Received status-change event:`, event.detail);
      this.updateServerStatus(event.detail.serverId, event.detail.status);
    });
  }

  /**
   * Render the settings panel
   */
  render() {
    const html = `
      <div class="mcp-settings-panel ${this.isVisible ? 'visible' : ''}" id="mcp-settings-panel">
        <div class="mcp-settings-header">
          <h2>MCP Settings</h2>
          <button class="close-button" aria-label="Close settings">✕</button>
        </div>
        
        <div class="mcp-settings-content">
          <div class="mcp-toggle-section">
            <label class="toggle-label">
              <input type="checkbox" id="mcp-enabled" checked>
              <span>Enable MCP Integration</span>
            </label>
          </div>
          
          <div class="mcp-servers-section">
            <h3>Configured Servers</h3>
            <div class="mcp-servers-list" id="mcp-servers-list">
              <!-- Server items will be rendered here -->
            </div>
          </div>
          
          <div class="mcp-actions">
            <button class="primary-button" id="add-server-btn">
              <span>➕</span> Add Server
            </button>
            <button class="secondary-button" id="import-config-btn">
              Import Config
            </button>
            <button class="secondary-button" id="export-config-btn">
              Export Config
            </button>
          </div>
        </div>
      </div>
    `;
    
    this.container.innerHTML = html;
    this.addStyles();
  }

  /**
   * Add component styles
   */
  addStyles() {
    if (document.getElementById('mcp-settings-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'mcp-settings-styles';
    style.textContent = `
      .mcp-settings-panel {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.9);
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 100000;
        pointer-events: none;
      }
      
      .mcp-settings-panel.visible {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      
      .mcp-settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
      }
      
      .mcp-settings-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .close-button {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: var(--text-secondary);
        padding: 4px 8px;
        border-radius: 4px;
        transition: all 0.2s;
      }
      
      .close-button:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }
      
      .mcp-settings-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      .mcp-toggle-section {
        margin-bottom: 24px;
      }
      
      .toggle-label {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
      }
      
      .toggle-label input[type="checkbox"] {
        margin-right: 8px;
      }
      
      .mcp-servers-section {
        margin-bottom: 24px;
      }
      
      .mcp-servers-section h3 {
        margin: 0 0 16px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      
      .mcp-servers-list {
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
      }
      
      .mcp-server-item {
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
      }
      
      .mcp-server-item:last-child {
        border-bottom: none;
      }
      
      .server-header {
        display: flex;
        align-items: center;
        padding: 16px;
      }
      
      .server-header:hover {
        background: var(--bg-tertiary);
      }
      
      .server-status {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 12px;
        flex-shrink: 0;
      }
      
      .server-status.connected {
        background: #22C55E;
      }
      
      .server-status.disconnected {
        background: #EF4444;
      }
      
      .server-status.connecting {
        background: #F59E0B;
        animation: pulse 1.5s infinite;
      }
      
      .server-status.disabled {
        background: #9CA3AF;
      }
      
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
      
      .server-info {
        flex: 1;
      }
      
      .server-name {
        font-weight: 500;
        margin-bottom: 4px;
      }
      
      .server-details {
        font-size: 12px;
        color: var(--text-secondary);
        display: flex;
        gap: 4px;
      }
      
      .capabilities-text {
        color: var(--text-primary);
        font-weight: 500;
      }
      
      .server-actions {
        display: flex;
        gap: 8px;
      }
      
      .server-action-btn {
        background: none;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
      }
      
      .server-action-btn:hover {
        background: var(--bg-primary);
        border-color: var(--accent-color);
      }
      
      /* Toggle switch styles */
      .server-toggle {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 20px;
        margin-right: 8px;
      }
      
      .server-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 20px;
        transition: .3s;
      }
      
      .toggle-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 2px;
        background-color: var(--text-secondary);
        border-radius: 50%;
        transition: .3s;
      }
      
      .server-toggle input:checked + .toggle-slider {
        background-color: var(--accent-color);
        border-color: var(--accent-color);
      }
      
      .server-toggle input:checked + .toggle-slider:before {
        background-color: white;
        transform: translateX(18px);
      }
      
      .expand-tools-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        padding: 6px 12px;
        margin-top: 8px;
        cursor: pointer;
        font-size: 12px;
        color: var(--text-primary);
        transition: all 0.2s;
        width: fit-content;
      }
      
      .expand-tools-btn:hover {
        background: var(--bg-primary);
        border-color: var(--accent-color);
        color: var(--accent-color);
      }
      
      .expand-icon {
        display: inline-block;
        transition: transform 0.2s;
        font-size: 10px;
      }
      
      .expand-tools-btn[data-expanded="true"] .expand-icon {
        transform: rotate(90deg);
      }
      
      .expand-text {
        font-weight: 500;
      }
      
      .server-tools-list {
        padding: 0 16px 16px 52px;
        background: var(--bg-primary);
        border-top: 1px solid var(--border-color);
      }
      
      .tools-loading {
        padding: 12px;
        color: var(--text-secondary);
        font-size: 13px;
      }
      
      .no-tools {
        padding: 12px;
        color: var(--text-secondary);
        font-size: 13px;
        font-style: italic;
      }
      
      .tools-section {
        margin-top: 12px;
      }
      
      .tools-section-header {
        font-weight: 500;
        color: var(--text-primary);
        margin-bottom: 8px;
        font-size: 13px;
      }
      
      .tools-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 8px;
      }
      
      .tool-item {
        padding: 8px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        cursor: default;
        transition: all 0.2s;
      }
      
      .tool-item:hover {
        background: var(--bg-tertiary);
        border-color: var(--accent-color);
      }
      
      .tool-name {
        font-family: 'Monaco', 'Consolas', monospace;
        font-size: 12px;
        color: var(--accent-color);
        font-weight: 500;
      }
      
      .tool-description {
        font-size: 11px;
        color: var(--text-secondary);
        margin-top: 4px;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      
      .mcp-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
      }
      
      .primary-button, .secondary-button {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .primary-button {
        background: var(--accent-color);
        color: white;
      }
      
      .primary-button:hover {
        background: #3562ce;
      }
      
      .secondary-button {
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
      }
      
      .secondary-button:hover {
        background: var(--bg-tertiary);
      }
      
      .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--text-secondary);
      }
      
      .empty-state p {
        margin-bottom: 20px;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Close button
    const closeBtn = this.container.querySelector('.close-button');
    if (closeBtn) {
      closeBtn.addEventListener('click', this.hide);
    }
    
    // MCP enabled toggle
    const enableToggle = this.container.querySelector('#mcp-enabled');
    if (enableToggle) {
      enableToggle.addEventListener('change', (e) => {
        this.handleEnableToggle(e.target.checked);
      });
    }
    
    // Add server button
    const addBtn = this.container.querySelector('#add-server-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.showAddServerDialog();
      });
    }
    
    // Import/Export buttons
    const importBtn = this.container.querySelector('#import-config-btn');
    if (importBtn) {
      importBtn.addEventListener('click', () => {
        this.handleImportConfig();
      });
    }
    
    const exportBtn = this.container.querySelector('#export-config-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.handleExportConfig();
      });
    }
    
    // Click outside to close (with delay to avoid immediate trigger)
    setTimeout(() => {
      document.addEventListener('click', (e) => {
        const panel = this.container.querySelector('.mcp-settings-panel');
        if (this.isVisible && panel && !panel.contains(e.target)) {
          // Don't hide if clicking on the MCP settings button in AI settings
          const mcpButton = e.target.closest('.mcp-settings-btn');
          // Also check for the chat header MCP button
          const chatMcpButton = e.target.closest('.chat-action-btn[title="MCP Settings"]');
          if (mcpButton || chatMcpButton) {
            return;
          }
          this.hide();
        }
      });
    }, 100);
  }

  /**
   * Generate vault ID from path (matches backend logic)
   * @param {string} vaultPath - Path to vault
   * @returns {string} 8-character vault ID
   */
  generateVaultId(vaultPath) {
    // Simple hash function for browser
    let hash = 0;
    for (let i = 0; i < vaultPath.length; i++) {
      const char = vaultPath.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
  }
  
  /**
   * Force update Qdrant configuration with current vault name
   */
  async forceUpdateQdrantConfig() {
    try {
      const vaultPath = await this.getCurrentVaultPath();
      if (!vaultPath) return;
      
      const vaultName = vaultPath.split('/').pop() || vaultPath.split('\\').pop() || 'default';
      const vaultId = this.generateVaultId(vaultPath);
      
      // Load settings directly to check if Qdrant exists
      const settings = await invoke('get_mcp_settings');
      const qdrantConfig = settings.servers?.['gaimplan-qdrant'];
      
      if (qdrantConfig && qdrantConfig.transport?.env) {
        // Update environment variables
        qdrantConfig.transport.env.VAULT_NAME = vaultName;
        qdrantConfig.transport.env.VAULT_ID = vaultId;
        
        // Save the updated configuration directly
        await invoke('save_mcp_server_config', { 
          serverId: 'gaimplan-qdrant', 
          config: qdrantConfig 
        });
        console.log(`Force updated Qdrant config with VAULT_NAME: ${vaultName}`);
        
        // Update in our local map too
        this.servers.set('gaimplan-qdrant', qdrantConfig);
        
        // If Qdrant is connected, restart it to apply new environment variables
        const status = mcpManager.status.get('gaimplan-qdrant');
        const isConnected = (typeof status === 'object' && status.status === 'connected') || 
                          (typeof status === 'string' && status === 'connected');
        
        if (isConnected) {
          console.log(`Restarting Qdrant server to apply vault name: ${vaultName}`);
          await mcpManager.disconnectServer('gaimplan-qdrant');
          await new Promise(resolve => setTimeout(resolve, 1000));
          await mcpManager.connectServer('gaimplan-qdrant', qdrantConfig);
          console.log(`Qdrant restarted with vault: ${vaultName}`);
        }
      }
    } catch (error) {
      console.error('Failed to force update Qdrant config:', error);
    }
  }
  
  /**
   * Manually sync vault name for Qdrant
   */
  async syncVaultNameForQdrant() {
    try {
      const vaultPath = await this.getCurrentVaultPath();
      if (!vaultPath) {
        this.showNotification('No vault open', 'error');
        return;
      }
      
      const vaultName = vaultPath.split('/').pop() || vaultPath.split('\\').pop() || 'default';
      const vaultId = this.generateVaultId(vaultPath);
      
      console.log(`Manual sync: Updating Qdrant with vault name: ${vaultName}`);
      
      // Get current configuration
      const qdrantConfig = this.servers.get('gaimplan-qdrant');
      if (!qdrantConfig) {
        this.showNotification('Qdrant server not found', 'error');
        return;
      }
      
      // Update environment variables
      if (!qdrantConfig.transport?.env) {
        qdrantConfig.transport = qdrantConfig.transport || {};
        qdrantConfig.transport.env = {};
      }
      
      qdrantConfig.transport.env.VAULT_NAME = vaultName;
      qdrantConfig.transport.env.VAULT_ID = vaultId;
      
      // Save configuration
      await this.saveConfiguration('gaimplan-qdrant', qdrantConfig);
      
      // If connected, disconnect and reconnect
      const status = mcpManager.status.get('gaimplan-qdrant');
      const isConnected = (typeof status === 'object' && status.status === 'connected') || 
                        (typeof status === 'string' && status === 'connected');
      
      if (isConnected) {
        this.showNotification('Restarting Qdrant with vault name: ' + vaultName, 'info');
        await mcpManager.disconnectServer('gaimplan-qdrant');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await mcpManager.connectServer('gaimplan-qdrant', qdrantConfig);
        this.showNotification('Qdrant restarted with vault: ' + vaultName, 'success');
      } else {
        this.showNotification('Qdrant configuration updated with vault: ' + vaultName, 'success');
      }
      
      // Refresh the server list
      this.renderServerList();
      
    } catch (error) {
      console.error('Failed to sync vault name:', error);
      this.showNotification('Failed to sync vault name: ' + error.message, 'error');
    }
  }
  
  /**
   * Load server configurations
   */
  async loadServers() {
    try {
      // Load from settings storage
      const settings = await invoke('get_mcp_settings');
      console.log('Loaded MCP settings:', settings);
      
      // Clear existing servers
      this.servers.clear();
      
      // Load servers from settings
      if (settings.servers) {
        // Get current vault path for updating environment variables
        const vaultPath = await this.getCurrentVaultPath();
        const vaultId = vaultPath ? this.generateVaultId(vaultPath) : 'default';
        const vaultName = vaultPath ? (vaultPath.split('/').pop() || vaultPath.split('\\').pop() || 'default') : 'default';
        
        Object.entries(settings.servers).forEach(([id, config]) => {
          // Update environment variables for bundled servers
          if (id === 'gaimplan-qdrant' && config.transport?.env) {
            config.transport.env.VAULT_ID = vaultId;
            config.transport.env.VAULT_NAME = vaultName;
            console.log(`Updated Qdrant server VAULT_ID to: ${vaultId}, VAULT_NAME to: ${vaultName}`);
          }
          if (id === 'gaimplan-neo4j' && config.transport?.env) {
            config.transport.env.VAULT_ID = vaultId;
          }
          if ((id === 'gaimplan-filesystem' || id === 'gaimplan-search' || id === 'gaimplan-git') && config.transport?.env && vaultPath) {
            config.transport.env.VAULT_PATH = vaultPath;
          }
          
          this.servers.set(id, config);
        });
      }
      
      // Set enabled state
      const enableToggle = this.container.querySelector('#mcp-enabled');
      if (enableToggle) {
        enableToggle.checked = settings.enabled !== false;
      }
      
      // Check if bundled servers need to be installed
      if (await shouldInstallBundledServers(this.servers)) {
        console.log('Installing bundled MCP servers...');
        
        // Get current vault path
        const vaultPath = await this.getCurrentVaultPath();
        
        if (vaultPath) {
          const bundled = await getBundledServers(vaultPath);
          
          for (const server of bundled) {
            if (!this.servers.has(server.id)) {
              this.servers.set(server.id, server);
              await this.saveConfiguration(server.id, server);
              console.log(`Installed bundled server: ${server.name}`);
            }
          }
        }
      }
      
      this.renderServerList();
      
      // Get current status
      await mcpManager.refreshStatuses();
      
      // Auto-connect enabled servers (only on first load)
      if (!this.serversLoaded) {
        this.serversLoaded = true;
        for (const [id, config] of this.servers.entries()) {
          if (config.enabled) {
            try {
              await mcpManager.connectServer(id, config);
            } catch (error) {
              console.error(`Failed to auto-connect server ${id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load MCP settings:', error);
    }
  }

  /**
   * Render the server list
   */
  renderServerList() {
    const listContainer = this.container.querySelector('#mcp-servers-list');
    if (!listContainer) return;
    
    if (this.servers.size === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <p>No MCP servers configured yet.</p>
          <button class="primary-button" onclick="document.querySelector('#add-server-btn').click()">
            <span>➕</span> Add Your First Server
          </button>
        </div>
      `;
      return;
    }
    
    const serverItems = Array.from(this.servers.entries()).map(([id, server]) => {
      // Get the actual current status from mcpManager
      const currentStatus = mcpManager.status.get(id);
      let status;
      
      // Handle both string and object status formats
      if (typeof currentStatus === 'object' && currentStatus.status) {
        status = currentStatus.status.toLowerCase();
      } else if (typeof currentStatus === 'string') {
        status = currentStatus.toLowerCase();
      } else {
        status = 'disconnected';
      }
      
      const statusClass = server.enabled ? status : 'disabled';
      
      // Get stored capabilities count
      const storedCaps = this.serverCapabilities.get(id);
      let capsText = '';
      if (status === 'connected') {
        if (storedCaps) {
          capsText = ` | ${storedCaps.toolsCount} Tools${storedCaps.resourcesCount > 0 ? `, ${storedCaps.resourcesCount} Resources` : ''}`;
        } else {
          capsText = ' | Loading...';
        }
      } else {
        capsText = ` | ${server.capabilities.tools ? 'Tools' : ''} ${server.capabilities.resources ? 'Resources' : ''}`.trim();
        if (capsText) capsText = ' | ' + capsText;
      }
      
      return `
        <div class="mcp-server-item" data-server-id="${id}">
          <div class="server-header">
            <div class="server-status ${statusClass}"></div>
            <div class="server-info">
              <div class="server-name">${server.name}</div>
              <div class="server-details">
                <span class="status-text">Status: ${this.formatStatus(statusClass)}</span>
                <span class="capabilities-text" id="caps-${id}">${capsText}</span>
              </div>
              ${status === 'connected' ? `
                <button class="expand-tools-btn" title="Show/Hide Tools" data-action="expand" data-server-id="${id}">
                  <span class="expand-icon">▶</span>
                  <span class="expand-text">Show Tools & Resources</span>
                </button>
              ` : ''}
            </div>
            <div class="server-actions">
              <label class="server-toggle" title="Enable/Disable Server">
                <input type="checkbox" 
                  class="server-enabled-checkbox" 
                  data-server-id="${id}" 
                  ${server.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
              <button class="server-action-btn" title="Settings" data-action="settings" data-server-id="${id}">⚙️</button>
              <button class="server-action-btn" title="Test Connection" data-action="test" data-server-id="${id}">🧪</button>
              ${id === 'gaimplan-qdrant' ? `<button class="server-action-btn" title="Sync Vault Name" data-action="sync-vault" data-server-id="${id}">🔄</button>` : ''}
              <button class="server-action-btn" title="Delete" data-action="delete" data-server-id="${id}">🗑️</button>
            </div>
          </div>
          <div class="server-tools-list" id="tools-${id}" style="display: none;">
            <div class="tools-loading">Loading tools...</div>
          </div>
        </div>
      `;
    }).join('');
    
    listContainer.innerHTML = serverItems;
    
    // Add action listeners
    listContainer.querySelectorAll('.server-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const serverId = e.currentTarget.dataset.serverId;
        this.handleServerAction(action, serverId);
      });
    });
    
    // Add expand button listeners
    listContainer.querySelectorAll('.expand-tools-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const serverId = e.currentTarget.dataset.serverId;
        this.handleServerAction('expand', serverId);
      });
    });
    
    // Add toggle listeners for enable/disable
    listContainer.querySelectorAll('.server-enabled-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const serverId = e.currentTarget.dataset.serverId;
        const enabled = e.currentTarget.checked;
        await this.toggleServerEnabled(serverId, enabled);
      });
    });
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      connected: '● Connected',
      disconnected: '○ Disconnected',
      connecting: '◐ Connecting',
      disabled: '○ Disabled',
      error: '⚠️ Error'
    };
    return statusMap[status] || status;
  }

  /**
   * Handle server action
   */
  async handleServerAction(action, serverId) {
    switch (action) {
      case 'expand':
        await this.toggleServerTools(serverId);
        break;
      case 'settings':
        this.showEditServerDialog(serverId);
        break;
      case 'test':
        await this.testServerConnection(serverId);
        break;
      case 'delete':
        await this.deleteServer(serverId);
        break;
      case 'sync-vault':
        await this.syncVaultNameForQdrant();
        break;
    }
  }

  /**
   * Toggle server enabled/disabled state
   */
  async toggleServerEnabled(serverId, enabled) {
    console.log(`[MCPSettingsPanel] Toggling server ${serverId} enabled: ${enabled}`);
    
    const server = this.servers.get(serverId);
    if (!server) {
      console.error(`[MCPSettingsPanel] Server not found: ${serverId}`);
      return;
    }
    
    // Update the server configuration
    server.enabled = enabled;
    await this.saveConfiguration(serverId, server);
    
    // Connect or disconnect based on enabled state
    if (enabled) {
      try {
        // Get current vault path
        const vaultPath = await this.getCurrentVaultPath();
        
        // For Qdrant, ensure VAULT_ID and VAULT_NAME are set before connecting
        if (serverId === 'gaimplan-qdrant' && server.transport?.env) {
          const vaultId = vaultPath ? this.generateVaultId(vaultPath) : 'default';
          const vaultName = vaultPath ? (vaultPath.split('/').pop() || vaultPath.split('\\').pop() || 'default') : 'default';
          server.transport.env.VAULT_ID = vaultId;
          server.transport.env.VAULT_NAME = vaultName;
          console.log(`Setting Qdrant VAULT_ID to: ${vaultId}, VAULT_NAME to: ${vaultName}`);
          await this.saveConfiguration(serverId, server);
        }
        
        // For filesystem, search, and git servers, ensure VAULT_PATH is set
        if ((serverId === 'gaimplan-filesystem' || serverId === 'gaimplan-search' || serverId === 'gaimplan-git') && server.transport?.env) {
          if (!vaultPath) {
            throw new Error('No vault path available');
          }
          server.transport.env.VAULT_PATH = vaultPath;
          console.log(`Setting ${serverId} VAULT_PATH to: ${vaultPath}`);
          await this.saveConfiguration(serverId, server);
        }
        
        await mcpManager.connectServer(serverId, server);
      } catch (error) {
        console.error(`[MCPSettingsPanel] Failed to connect server ${serverId}:`, error);
        this.showNotification(`Failed to connect ${server.name}: ${error}`, 'error');
        // Reset the toggle
        const checkbox = document.querySelector(`.server-enabled-checkbox[data-server-id="${serverId}"]`);
        if (checkbox) checkbox.checked = false;
        server.enabled = false;
        await this.saveConfiguration(serverId, server);
      }
    } else {
      try {
        await mcpManager.disconnectServer(serverId);
      } catch (error) {
        console.error(`[MCPSettingsPanel] Failed to disconnect server ${serverId}:`, error);
      }
    }
  }
  
  /**
   * Toggle the tools list for a server
   */
  async toggleServerTools(serverId) {
    console.log(`[MCPSettingsPanel] Toggling tools for server: ${serverId}`);
    
    const toolsDiv = document.getElementById(`tools-${serverId}`);
    const expandBtn = document.querySelector(`[data-action="expand"][data-server-id="${serverId}"]`);
    const expandIcon = expandBtn?.querySelector('.expand-icon');
    const expandText = expandBtn?.querySelector('.expand-text');
    
    if (!toolsDiv) {
      console.error(`[MCPSettingsPanel] Tools div not found for server: ${serverId}`);
      return;
    }
    
    const isHidden = toolsDiv.style.display === 'none';
    console.log(`[MCPSettingsPanel] Tools currently hidden: ${isHidden}`);
    
    if (isHidden) {
      // Show tools
      toolsDiv.style.display = 'block';
      if (expandBtn) {
        expandBtn.setAttribute('data-expanded', 'true');
        if (expandText) expandText.textContent = 'Hide Tools & Resources';
      }
      
      // Load tools if not already loaded
      if (toolsDiv.querySelector('.tools-loading')) {
        console.log(`[MCPSettingsPanel] Loading tools for ${serverId}...`);
        await this.loadServerTools(serverId);
      }
    } else {
      // Hide tools
      toolsDiv.style.display = 'none';
      if (expandBtn) {
        expandBtn.setAttribute('data-expanded', 'false');
        if (expandText) expandText.textContent = 'Show Tools & Resources';
      }
    }
  }
  
  /**
   * Load and display tools for a server
   */
  async loadServerTools(serverId) {
    const toolsDiv = document.getElementById(`tools-${serverId}`);
    if (!toolsDiv) return;
    
    try {
      // Check if server is connected
      const currentStatus = mcpManager.status.get(serverId);
      let isConnected = false;
      
      if (typeof currentStatus === 'object' && currentStatus.status) {
        isConnected = currentStatus.status.toLowerCase() === 'connected';
      } else if (typeof currentStatus === 'string') {
        isConnected = currentStatus.toLowerCase() === 'connected';
      }
      
      if (!isConnected) {
        toolsDiv.innerHTML = '<div class="no-tools">Server not connected</div>';
        return;
      }
      
      // Get tools from the server
      const tools = await mcpManager.getServerTools(serverId);
      const resources = await mcpManager.getServerResources(serverId);
      
      if (!tools.length && !resources.length) {
        toolsDiv.innerHTML = '<div class="no-tools">No tools or resources available</div>';
        return;
      }
      
      // Build tools HTML
      let html = '';
      
      if (tools.length > 0) {
        html += '<div class="tools-section">';
        html += `<div class="tools-section-header">🔧 Tools (${tools.length})</div>`;
        html += '<div class="tools-grid">';
        
        tools.forEach(tool => {
          html += `
            <div class="tool-item" title="${tool.description || 'No description'}">
              <div class="tool-name">${tool.name}</div>
              ${tool.description ? `<div class="tool-description">${tool.description}</div>` : ''}
            </div>
          `;
        });
        
        html += '</div></div>';
      }
      
      if (resources.length > 0) {
        html += '<div class="tools-section">';
        html += `<div class="tools-section-header">📦 Resources (${resources.length})</div>`;
        html += '<div class="tools-grid">';
        
        resources.forEach(resource => {
          html += `
            <div class="tool-item" title="${resource.description || 'No description'}">
              <div class="tool-name">${resource.name}</div>
              ${resource.description ? `<div class="tool-description">${resource.description}</div>` : ''}
            </div>
          `;
        });
        
        html += '</div></div>';
      }
      
      toolsDiv.innerHTML = html;
      
    } catch (error) {
      console.error(`Failed to load tools for ${serverId}:`, error);
      toolsDiv.innerHTML = '<div class="error">Failed to load tools</div>';
    }
  }

  /**
   * Update capabilities display for all connected servers
   */
  async updateAllServerCapabilities() {
    console.log('[MCPSettingsPanel] Updating capabilities for all connected servers');
    
    for (const [serverId, server] of this.servers.entries()) {
      const currentStatus = mcpManager.status.get(serverId);
      let isConnected = false;
      
      // Check if server is connected
      if (typeof currentStatus === 'object' && currentStatus.status) {
        isConnected = currentStatus.status.toLowerCase() === 'connected';
      } else if (typeof currentStatus === 'string') {
        isConnected = currentStatus.toLowerCase() === 'connected';
      }
      
      if (isConnected) {
        await this.updateServerCapabilities(serverId);
      }
    }
  }
  
  /**
   * Update capabilities display for a specific server
   */
  async updateServerCapabilities(serverId) {
    try {
      const capsElement = document.getElementById(`caps-${serverId}`);
      if (!capsElement) return;
      
      // Double-check server is still connected
      const currentStatus = mcpManager.status.get(serverId);
      let isConnected = false;
      
      if (typeof currentStatus === 'object' && currentStatus.status) {
        isConnected = currentStatus.status.toLowerCase() === 'connected';
      } else if (typeof currentStatus === 'string') {
        isConnected = currentStatus.toLowerCase() === 'connected';
      }
      
      if (!isConnected) {
        console.log(`[MCPSettingsPanel] Server ${serverId} is not connected, skipping capabilities`);
        return;
      }
      
      // Get tool and resource counts
      console.log(`[MCPSettingsPanel] Fetching capabilities for ${serverId}...`);
      
      let tools = [];
      let resources = [];
      
      try {
        tools = await mcpManager.listTools(serverId);
        console.log(`[MCPSettingsPanel] Got ${tools.length} tools for ${serverId}`);
      } catch (err) {
        console.error(`[MCPSettingsPanel] Failed to list tools for ${serverId}:`, err);
      }
      
      try {
        resources = await mcpManager.listResources(serverId);
        console.log(`[MCPSettingsPanel] Got ${resources.length} resources for ${serverId}`);
      } catch (err) {
        // Resources might not be supported by all servers
        console.log(`[MCPSettingsPanel] No resources for ${serverId} (might not be supported)`);
      }
      
      // Store capabilities count
      this.serverCapabilities.set(serverId, {
        toolsCount: tools.length,
        resourcesCount: resources.length
      });
      
      // Format the display
      const parts = [];
      if (tools.length > 0 || resources.length > 0) {
        if (tools.length > 0) parts.push(`${tools.length} Tools`);
        if (resources.length > 0) parts.push(`${resources.length} Resources`);
        capsElement.textContent = ` | ${parts.join(', ')}`;
      } else {
        capsElement.textContent = ' | No capabilities';
      }
      
      console.log(`[MCPSettingsPanel] Updated ${serverId}: ${capsElement.textContent}`);
    } catch (error) {
      console.error(`[MCPSettingsPanel] Failed to update capabilities for ${serverId}:`, error);
    }
  }

  /**
   * Update server status in UI
   */
  updateServerStatus(serverId, status) {
    console.log(`[MCPSettingsPanel] Updating server status: ${serverId} -> ${status}`);
    
    if (!this.container) {
      console.error(`[MCPSettingsPanel] Container is null, cannot update status`);
      return;
    }
    
    const serverItem = this.container.querySelector(`[data-server-id="${serverId}"]`);
    if (!serverItem) {
      console.error(`[MCPSettingsPanel] Could not find server item for ${serverId}`);
      return;
    }
    
    const statusEl = serverItem.querySelector('.server-status');
    if (statusEl) {
      // Force remove all classes and re-add
      statusEl.className = '';
      statusEl.offsetHeight; // Force reflow
      statusEl.className = `server-status ${status}`;
      console.log(`[MCPSettingsPanel] Updated status element class to: server-status ${status}`);
    } else {
      console.error(`[MCPSettingsPanel] Could not find status element for ${serverId}`);
    }
    
    const detailsEl = serverItem.querySelector('.server-details');
    if (detailsEl) {
      const server = this.servers.get(serverId);
      if (server) {
        detailsEl.textContent = `Status: ${this.formatStatus(status)} | ${server.capabilities.tools ? 'Tools ✓' : ''} ${server.capabilities.resources ? 'Resources ✓' : ''}`;
      }
    }
  }

  /**
   * Show add server dialog
   */
  showAddServerDialog() {
    serverConfigDialog.show(null, async (config) => {
      // Save the new server configuration
      this.servers.set(config.id, config);
      
      // Save to persistent storage
      await this.saveConfiguration(config.id, config);
      
      // Re-render the list
      this.renderServerList();
      
      // Show success notification
      this.showNotification(`Added server: ${config.name}`, 'success');
      
      // If enabled, connect to it
      if (config.enabled) {
        try {
          await mcpManager.connectServer(config.id, config);
        } catch (error) {
          console.error('Failed to connect to new server:', error);
          this.showNotification(`Failed to connect: ${error.message}`, 'error');
        }
      }
    });
  }

  /**
   * Show edit server dialog
   */
  showEditServerDialog(serverId) {
    const server = this.servers.get(serverId);
    if (!server) return;
    
    serverConfigDialog.show(server, async (config) => {
      // Update the configuration
      this.servers.set(serverId, config);
      
      // Save to persistent storage
      await this.saveConfiguration(serverId, config);
      
      // Re-render the list
      this.renderServerList();
      
      // Show success notification
      this.showNotification(`Updated server: ${config.name}`, 'success');
      
      // If status changed, handle connection
      const currentStatus = mcpManager.status.get(serverId);
      
      if (!config.enabled && (currentStatus === 'connected' || currentStatus === 'error')) {
        // Disconnect if disabling
        try {
          await mcpManager.disconnectServer(serverId);
        } catch (error) {
          console.log('Error disconnecting:', error);
        }
      } else if (config.enabled && currentStatus === 'disconnected') {
        // Connect if enabling and currently disconnected
        try {
          await mcpManager.connectServer(serverId, config);
        } catch (error) {
          console.error('Failed to connect to server:', error);
          this.showNotification(`Failed to connect: ${error.message}`, 'error');
        }
      }
      // Don't try to reconnect servers that are already connected, connecting, or in error state
    });
  }

  /**
   * Test server connection
   */
  async testServerConnection(serverId) {
    const server = this.servers.get(serverId);
    if (!server) return;
    
    try {
      // Check if server is already connected
      const currentStatus = mcpManager.status.get(serverId);
      const wasConnected = currentStatus === 'connected';
      
      this.showNotification(`Testing ${server.name}...`, 'info');
      
      if (!wasConnected) {
        // Server is not connected, connect it for testing
        await mcpManager.connectServer(serverId, {
          enabled: server.enabled,
          transport: server.transport,
          capabilities: server.capabilities,
          permissions: server.permissions || {
            read: true,
            write: false,
            delete: false,
            external_access: false
          }
        });
        
        // Wait for connection to establish
        let connected = false;
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (mcpManager.status.get(serverId) === 'connected') {
            connected = true;
            break;
          }
        }
        
        if (!connected) {
          throw new Error('Connection timeout');
        }
      }
      
      // Now test the server capabilities
      try {
        // Get server info (testing connection)
        await mcpManager.getServerInfo(serverId);
        
        // List available tools
        const tools = await mcpManager.listTools(serverId);
        
        // List available resources
        const resources = await mcpManager.listResources(serverId);
        
        // Show detailed success message
        this.showNotification(
          `✅ ${server.name} is working! Found ${tools.length} tools and ${resources.length} resources`, 
          'success'
        );
        
      } catch (testError) {
        // Connection succeeded but testing failed
        this.showNotification(
          `⚠️ ${server.name} connected but test failed: ${testError.message}`, 
          'warning'
        );
      }
      
      // Only disconnect if it wasn't originally connected
      if (!wasConnected) {
        await mcpManager.disconnectServer(serverId);
      }
      
    } catch (error) {
      this.showNotification(`❌ Failed to connect to ${server.name}: ${error.message}`, 'error');
    }
  }

  /**
   * Delete server
   */
  async deleteServer(serverId) {
    const server = this.servers.get(serverId);
    if (!server) return;
    
    if (confirm(`Are you sure you want to delete "${server.name}"?`)) {
      // Disconnect if connected
      if (mcpManager.status.get(serverId) === 'connected') {
        await mcpManager.disconnectServer(serverId);
      }
      
      // Remove from local state
      this.servers.delete(serverId);
      
      // Remove from persistent storage
      await this.deleteConfiguration(serverId);
      
      // Re-render
      this.renderServerList();
      
      this.showNotification(`Deleted server: ${server.name}`, 'info');
    }
  }

  /**
   * Handle enable toggle
   */
  async handleEnableToggle(enabled) {
    console.log('MCP enabled:', enabled);
    
    try {
      // Get current settings
      const settings = await invoke('get_mcp_settings');
      settings.enabled = enabled;
      
      // Save updated settings
      await invoke('save_mcp_settings', { settings });
      
      this.showNotification(`MCP integration ${enabled ? 'enabled' : 'disabled'}`, 'info');
    } catch (error) {
      console.error('Failed to save MCP enabled state:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  /**
   * Handle import config
   */
  async handleImportConfig() {
    // TODO: Implement config import
    console.log('Import config');
  }

  /**
   * Handle export config
   */
  async handleExportConfig() {
    // TODO: Implement config export
    console.log('Export config');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    // Use existing notification system if available
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      console.log(`[${type}] ${message}`);
    }
  }

  /**
   * Show the settings panel
   */
  show() {
    console.log('MCPSettingsPanel.show() called');
    console.log('Container exists?', !!this.container);
    
    this.isVisible = true;
    const panel = this.container.querySelector('.mcp-settings-panel');
    console.log('Panel element found?', !!panel);
    
    if (panel) {
      panel.classList.add('visible');
      console.log('Added visible class to panel');
      
      // Refresh the server list after a short delay to ensure we have latest status
      setTimeout(() => {
        console.log('[MCPSettingsPanel] Refreshing server list to show current status');
        this.renderServerList();
        
        // Update capabilities for all connected servers with a longer delay
        // to ensure servers are properly connected
        setTimeout(() => {
          this.updateAllServerCapabilities();
        }, 1000);
      }, 100);
    } else {
      console.error('Panel element not found!');
    }
  }

  /**
   * Hide the settings panel
   */
  hide() {
    console.log('MCPSettingsPanel.hide() called');
    this.isVisible = false;
    const panel = this.container.querySelector('.mcp-settings-panel');
    if (panel) {
      panel.classList.remove('visible');
    }
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  /**
   * Get current vault path
   */
  async getCurrentVaultPath() {
    try {
      // Check if we have a vault path in the window object
      if (window.currentVaultPath) {
        return window.currentVaultPath;
      }
      
      // Try to get from vault info
      const vaultInfo = await invoke('get_vault_info');
      if (vaultInfo && vaultInfo.path) {
        return vaultInfo.path;
      }
    } catch (error) {
      console.error('Failed to get vault path:', error);
    }
    
    return null;
  }
  
  /**
   * Save server configuration to persistent storage
   */
  async saveConfiguration(serverId, config) {
    try {
      await invoke('save_mcp_server_config', { serverId, config });
      console.log(`Saved configuration for server: ${serverId}`);
    } catch (error) {
      console.error('Failed to save server configuration:', error);
      throw error;
    }
  }
  
  /**
   * Delete server configuration from persistent storage
   */
  async deleteConfiguration(serverId) {
    try {
      await invoke('delete_mcp_server_config', { serverId });
      console.log(`Deleted configuration for server: ${serverId}`);
    } catch (error) {
      console.error('Failed to delete server configuration:', error);
      throw error;
    }
  }
}

// Create singleton instance
export const mcpSettingsPanel = new MCPSettingsPanel();