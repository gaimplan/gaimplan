import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

/**
 * Server Configuration Dialog
 * Modal dialog for adding/editing MCP server configurations
 */
export class ServerConfigDialog {
  constructor() {
    this.container = null;
    this.config = {
      id: '',
      name: '',
      enabled: true,
      transport: {
        type: 'stdio',
        command: '',
        args: [],
        env: {},
        working_dir: null
      },
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
        sampling: false
      },
      permissions: {
        read: true,
        write: false,
        delete: false,
        external_access: false
      }
    };
    
    this.isEditMode = false;
    this.onSave = null;
    this.onCancel = null;
  }

  /**
   * Show the dialog
   * @param {Object} config - Existing configuration (for edit mode)
   * @param {Function} onSave - Callback when saved
   * @param {Function} onCancel - Callback when cancelled
   */
  show(config = null, onSave = null, onCancel = null) {
    this.onSave = onSave;
    this.onCancel = onCancel;
    
    if (config) {
      this.config = JSON.parse(JSON.stringify(config)); // Deep clone
      this.isEditMode = true;
    } else {
      this.resetConfig();
      this.isEditMode = false;
    }
    
    this.render();
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig() {
    this.config = {
      id: 'server-' + Date.now(),
      name: '',
      enabled: true,
      transport: {
        type: 'stdio',
        command: '',
        args: [],
        env: {},
        working_dir: null
      },
      capabilities: {
        tools: true,
        resources: true,
        prompts: false,
        sampling: false
      },
      permissions: {
        read: true,
        write: false,
        delete: false,
        external_access: false
      }
    };
  }

  /**
   * Render the dialog
   */
  render() {
    // Remove existing dialog if any
    this.cleanup();
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.cancel();
      }
    };
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'server-config-dialog';
    
    dialog.innerHTML = `
      <div class="dialog-header">
        <h2>${this.isEditMode ? 'Edit' : 'Add'} MCP Server</h2>
        <button class="close-button" onclick="window.serverConfigDialog.cancel()">✕</button>
      </div>
      
      <div class="dialog-content">
        <div class="form-section">
          <h3>Basic Information</h3>
          
          <div class="form-group">
            <label for="server-name">Server Name <span class="required">*</span></label>
            <input 
              type="text" 
              id="server-name" 
              value="${this.config.name}"
              placeholder="e.g., Vault Tools, Git Helper"
              onchange="window.serverConfigDialog.updateConfig('name', this.value)"
            />
          </div>
          
          <div class="form-group">
            <label>
              <input 
                type="checkbox" 
                ${this.config.enabled ? 'checked' : ''}
                onchange="window.serverConfigDialog.updateConfig('enabled', this.checked)"
              />
              Enable this server
            </label>
          </div>
        </div>
        
        <div class="form-section">
          <h3>Transport Configuration</h3>
          
          <div class="form-group">
            <label>Transport Type</label>
            <div class="radio-group">
              <label>
                <input 
                  type="radio" 
                  name="transport-type" 
                  value="stdio"
                  ${this.config.transport.type === 'stdio' ? 'checked' : ''}
                  onchange="window.serverConfigDialog.updateTransport('type', 'stdio')"
                />
                Local (stdio)
              </label>
              <label>
                <input 
                  type="radio" 
                  name="transport-type" 
                  value="http"
                  ${this.config.transport.type === 'http' ? 'checked' : ''}
                  onchange="window.serverConfigDialog.updateTransport('type', 'http')"
                />
                Remote (HTTP/SSE)
              </label>
            </div>
          </div>
          
          ${this.config.transport.type === 'stdio' ? this.renderStdioConfig() : this.renderHttpConfig()}
        </div>
        
        <div class="form-section">
          <h3>Capabilities</h3>
          <div class="checkbox-group">
            <label>
              <input 
                type="checkbox" 
                ${this.config.capabilities.tools ? 'checked' : ''}
                onchange="window.serverConfigDialog.updateCapability('tools', this.checked)"
              />
              Tools - Execute functions and commands
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.capabilities.resources ? 'checked' : ''}
                onchange="window.serverConfigDialog.updateCapability('resources', this.checked)"
              />
              Resources - Read data and files
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.capabilities.prompts ? 'checked' : ''}
                onchange="window.serverConfigDialog.updateCapability('prompts', this.checked)"
              />
              Prompts - Provide prompt templates
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.capabilities.sampling ? 'checked' : ''}
                onchange="window.serverConfigDialog.updateCapability('sampling', this.checked)"
              />
              Sampling - Control AI generation
            </label>
          </div>
        </div>
        
        <div class="form-section">
          <h3>Permissions</h3>
          <div class="checkbox-group">
            <label>
              <input 
                type="checkbox" 
                ${this.config.permissions.read ? 'checked' : ''}
                onchange="window.serverConfigDialog.updatePermission('read', this.checked)"
              />
              Read Files
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.permissions.write ? 'checked' : ''}
                onchange="window.serverConfigDialog.updatePermission('write', this.checked)"
              />
              Create Files
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.permissions.delete ? 'checked' : ''}
                onchange="window.serverConfigDialog.updatePermission('delete', this.checked)"
              />
              Delete Files
            </label>
            <label>
              <input 
                type="checkbox" 
                ${this.config.permissions.external_access ? 'checked' : ''}
                onchange="window.serverConfigDialog.updatePermission('external_access', this.checked)"
              />
              External Network Access
            </label>
          </div>
        </div>
        
        <div class="test-section" id="test-section">
          <!-- Test results will be shown here -->
        </div>
      </div>
      
      <div class="dialog-footer">
        <button class="secondary-button" onclick="window.serverConfigDialog.cancel()">
          Cancel
        </button>
        <button class="secondary-button" onclick="window.serverConfigDialog.testConnection()">
          Test Connection
        </button>
        <button class="primary-button" onclick="window.serverConfigDialog.save()">
          ${this.isEditMode ? 'Update' : 'Add'} Server
        </button>
      </div>
    `;
    
    // Add styles
    this.addStyles();
    
    // Append to overlay
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Store reference
    this.container = overlay;
    
    // Make instance available globally for event handlers
    window.serverConfigDialog = this;
    
    // Focus on name input
    setTimeout(() => {
      const nameInput = document.getElementById('server-name');
      if (nameInput) nameInput.focus();
    }, 100);
  }

  /**
   * Render stdio configuration fields
   */
  renderStdioConfig() {
    return `
      <div class="form-group">
        <label for="server-command">Command <span class="required">*</span></label>
        <div class="input-with-button">
          <input 
            type="text" 
            id="server-command" 
            value="${this.config.transport.command}"
            placeholder="e.g., node, python, /usr/local/bin/mcp-server"
            onchange="window.serverConfigDialog.updateTransport('command', this.value)"
          />
          <button class="browse-button" onclick="window.serverConfigDialog.browseCommand()">
            Browse...
          </button>
        </div>
      </div>
      
      <div class="form-group">
        <label for="server-args">Arguments</label>
        <input 
          type="text" 
          id="server-args" 
          value="${this.config.transport.args.join(' ')}"
          placeholder="e.g., ./servers/vault-tools/index.js --verbose"
          onchange="window.serverConfigDialog.updateTransport('args', this.value.split(' ').filter(a => a))"
        />
        <small>Space-separated command arguments</small>
      </div>
      
      <div class="form-group">
        <label>Environment Variables</label>
        <div id="env-vars-list">
          ${Object.entries(this.config.transport.env || {}).map(([key, value]) => `
            <div class="env-var-item">
              <input type="text" value="${key}" placeholder="KEY" onchange="window.serverConfigDialog.updateEnvVar(this, 'key', '${key}')">
              <span>=</span>
              <input type="text" value="${value}" placeholder="VALUE" onchange="window.serverConfigDialog.updateEnvVar(this, 'value', '${key}')">
              <button class="remove-button" onclick="window.serverConfigDialog.removeEnvVar('${key}')">✕</button>
            </div>
          `).join('')}
        </div>
        <button class="add-button" onclick="window.serverConfigDialog.addEnvVar()">
          + Add Variable
        </button>
      </div>
      
      <div class="form-group">
        <label for="server-workdir">Working Directory</label>
        <div class="input-with-button">
          <input 
            type="text" 
            id="server-workdir" 
            value="${this.config.transport.working_dir || ''}"
            placeholder="e.g., /path/to/project (optional)"
            onchange="window.serverConfigDialog.updateTransport('working_dir', this.value || null)"
          />
          <button class="browse-button" onclick="window.serverConfigDialog.browseWorkDir()">
            Browse...
          </button>
        </div>
        <small>Leave empty to use default</small>
      </div>
    `;
  }

  /**
   * Render HTTP configuration fields
   */
  renderHttpConfig() {
    return `
      <div class="form-group">
        <label for="server-url">Server URL <span class="required">*</span></label>
        <input 
          type="text" 
          id="server-url" 
          value="${this.config.transport.url || ''}"
          placeholder="e.g., http://localhost:8080/mcp"
          onchange="window.serverConfigDialog.updateTransport('url', this.value)"
        />
      </div>
      
      <div class="form-group">
        <label for="server-api-key">API Key (optional)</label>
        <input 
          type="password" 
          id="server-api-key" 
          value="${this.config.transport.api_key || ''}"
          placeholder="Optional authentication key"
          onchange="window.serverConfigDialog.updateTransport('api_key', this.value)"
        />
      </div>
    `;
  }

  /**
   * Add component styles
   */
  addStyles() {
    if (document.getElementById('server-config-dialog-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'server-config-dialog-styles';
    style.textContent = `
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100001;
        animation: fadeIn 0.2s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .server-config-dialog {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        width: 600px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        animation: slideIn 0.3s ease;
      }
      
      @keyframes slideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      .dialog-header {
        padding: 20px;
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .dialog-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }
      
      .dialog-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
      }
      
      .dialog-footer {
        padding: 20px;
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      
      .form-section {
        margin-bottom: 24px;
      }
      
      .form-section h3 {
        margin: 0 0 16px 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      
      .form-group {
        margin-bottom: 16px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 500;
      }
      
      .form-group input[type="text"],
      .form-group input[type="password"] {
        width: 100%;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 13px;
        color: var(--text-primary);
      }
      
      .form-group input[type="text"]:focus,
      .form-group input[type="password"]:focus {
        outline: none;
        border-color: var(--accent-color);
      }
      
      .form-group small {
        display: block;
        margin-top: 4px;
        font-size: 11px;
        color: var(--text-secondary);
      }
      
      .required {
        color: #ef4444;
      }
      
      .radio-group,
      .checkbox-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .radio-group label,
      .checkbox-group label {
        display: flex;
        align-items: center;
        cursor: pointer;
        font-size: 13px;
      }
      
      .radio-group input,
      .checkbox-group input {
        margin-right: 8px;
      }
      
      .input-with-button {
        display: flex;
        gap: 8px;
      }
      
      .input-with-button input {
        flex: 1;
      }
      
      .browse-button {
        padding: 8px 16px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }
      
      .browse-button:hover {
        background: var(--bg-tertiary);
      }
      
      .env-var-item {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      
      .env-var-item input {
        flex: 1;
        padding: 6px 10px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 12px;
      }
      
      .remove-button {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px 8px;
        font-size: 16px;
      }
      
      .remove-button:hover {
        color: #ef4444;
      }
      
      .add-button {
        padding: 6px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      
      .add-button:hover {
        background: var(--bg-tertiary);
      }
      
      .test-section {
        margin-top: 20px;
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 6px;
        display: none;
      }
      
      .test-section.show {
        display: block;
      }
      
      .test-section h4 {
        margin: 0 0 12px 0;
        font-size: 14px;
        font-weight: 600;
      }
      
      .test-result {
        font-size: 13px;
        line-height: 1.6;
      }
      
      .test-result.success {
        color: #22c55e;
      }
      
      .test-result.error {
        color: #ef4444;
      }
      
      .test-result ul {
        margin: 8px 0;
        padding-left: 20px;
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Update configuration
   */
  updateConfig(key, value) {
    this.config[key] = value;
  }

  /**
   * Update transport configuration
   */
  updateTransport(key, value) {
    this.config.transport[key] = value;
    if (key === 'type') {
      // Re-render transport section
      this.render();
    }
  }

  /**
   * Update capability
   */
  updateCapability(key, value) {
    this.config.capabilities[key] = value;
  }

  /**
   * Update permission
   */
  updatePermission(key, value) {
    this.config.permissions[key] = value;
  }

  /**
   * Add environment variable
   */
  addEnvVar() {
    // Ensure env object exists
    if (!this.config.transport.env) {
      this.config.transport.env = {};
    }
    
    const key = `VAR_${Object.keys(this.config.transport.env).length + 1}`;
    this.config.transport.env[key] = '';
    this.render();
  }

  /**
   * Update environment variable
   */
  updateEnvVar(input, type, oldKey) {
    const value = input.value;
    
    // Ensure env object exists
    if (!this.config.transport.env) {
      this.config.transport.env = {};
    }
    
    if (type === 'key') {
      // Key changed - need to update the object
      const oldValue = this.config.transport.env[oldKey];
      delete this.config.transport.env[oldKey];
      if (value) {
        this.config.transport.env[value] = oldValue;
      }
    } else {
      // Value changed
      this.config.transport.env[oldKey] = value;
    }
  }

  /**
   * Remove environment variable
   */
  removeEnvVar(key) {
    delete this.config.transport.env[key];
    this.render();
  }

  /**
   * Browse for command
   */
  async browseCommand() {
    try {
      const file = await open({
        multiple: false,
        directory: false
      });
      
      if (file) {
        document.getElementById('server-command').value = file;
        this.config.transport.command = file;
      }
    } catch (error) {
      console.error('Failed to browse for command:', error);
    }
  }

  /**
   * Browse for working directory
   */
  async browseWorkDir() {
    try {
      const dir = await open({
        multiple: false,
        directory: true
      });
      
      if (dir) {
        document.getElementById('server-workdir').value = dir;
        this.config.transport.working_dir = dir;
      }
    } catch (error) {
      console.error('Failed to browse for directory:', error);
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    const testSection = document.getElementById('test-section');
    testSection.className = 'test-section show';
    testSection.innerHTML = '<div class="test-result">Testing connection...</div>';
    
    try {
      // Validate required fields
      if (!this.config.name) {
        throw new Error('Server name is required');
      }
      
      if (this.config.transport.type === 'stdio' && !this.config.transport.command) {
        throw new Error('Command is required for stdio transport');
      }
      
      if (this.config.transport.type === 'http' && !this.config.transport.url) {
        throw new Error('URL is required for HTTP transport');
      }
      
      // Test connection using MCP manager
      const { mcpManager } = await import('./MCPManager.js');
      
      // Check if already connected
      const wasConnected = mcpManager.status.get(this.config.id) === 'connected';
      
      if (!wasConnected) {
        await mcpManager.connectServer(this.config.id, this.config);
        
        // Wait for connection
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Get server info
      const info = await mcpManager.getServerInfo(this.config.id);
      
      // Get available tools
      const tools = await mcpManager.listTools(this.config.id);
      
      // Get available resources
      const resources = await mcpManager.listResources(this.config.id);
      
      testSection.innerHTML = `
        <h4>✅ Connection Successful</h4>
        <div class="test-result success">
          <strong>Server Info:</strong><br>
          Name: ${info.name}<br>
          Version: ${info.version}<br>
          <br>
          <strong>Discovered:</strong>
          <ul>
            <li>${tools.length} tools</li>
            <li>${resources.length} resources</li>
          </ul>
        </div>
      `;
      
      // Disconnect only if we connected
      if (!wasConnected) {
        await mcpManager.disconnectServer(this.config.id);
      }
      
    } catch (error) {
      testSection.innerHTML = `
        <h4>❌ Connection Failed</h4>
        <div class="test-result error">
          ${error.message}
        </div>
      `;
    }
  }

  /**
   * Save configuration
   */
  async save() {
    try {
      // Validate required fields
      if (!this.config.name) {
        alert('Please enter a server name');
        return;
      }
      
      if (this.config.transport.type === 'stdio' && !this.config.transport.command) {
        alert('Please enter a command for the server');
        return;
      }
      
      if (this.config.transport.type === 'http' && !this.config.transport.url) {
        alert('Please enter a URL for the server');
        return;
      }
      
      // Call save callback
      if (this.onSave) {
        await this.onSave(this.config);
      }
      
      // Close dialog
      this.cleanup();
      
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration: ' + error.message);
    }
  }

  /**
   * Cancel and close dialog
   */
  cancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.cleanup();
  }

  /**
   * Clean up dialog
   */
  cleanup() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    delete window.serverConfigDialog;
  }
}

// Create singleton instance
export const serverConfigDialog = new ServerConfigDialog();