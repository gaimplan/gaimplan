import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { MCPClient } from './MCPClient.js';

/**
 * Central manager for all MCP operations in the frontend
 */
export class MCPManager {
  constructor() {
    /** @type {Map<string, MCPClient>} */
    this.clients = new Map();
    
    /** @type {Map<string, Object>} */
    this.capabilities = new Map();
    
    /** @type {Map<string, string>} */
    this.status = new Map();
    
    /** @type {EventTarget} */
    this.eventEmitter = new EventTarget();
    
    /** @type {Map<string, Function>} */
    this.eventUnsubscribers = new Map();
    
    /** @type {Set<Function>} Callbacks for status changes */
    this.statusChangeCallbacks = new Set();
  }

  /**
   * Initialize the MCP manager
   */
  async initialize() {
    console.log('[MCPManager] Initializing...');
    
    // Load saved configurations
    await this.loadConfigurations();
    
    // Get initial server statuses
    await this.refreshStatuses();
  }

  /**
   * Connect to an MCP server
   * @param {string} serverId - Unique identifier for the server
   * @param {Object} config - Server configuration
   */
  async connectServer(serverId, config) {
    console.log(`[MCPManager] Connecting to server: ${serverId}`, config);
    
    // Check if already connected or connecting
    const currentStatus = this.status.get(serverId);
    if (currentStatus === 'connected' || currentStatus === 'connecting') {
      console.log(`[MCPManager] Server ${serverId} is already ${currentStatus}`);
      return;
    }
    
    try {
      // Always try to stop the server first to ensure clean state
      console.log(`[MCPManager] Ensuring ${serverId} is stopped before starting`);
      try {
        await invoke('stop_mcp_server', { serverId });
        // Small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (stopError) {
        // Ignore stop errors - server might not be running
        console.log(`[MCPManager] Stop attempt for ${serverId} (expected if not running):`, stopError.message);
      }
      
      // Clean up any existing client
      const existingClient = this.clients.get(serverId);
      if (existingClient) {
        try {
          await existingClient.disconnect();
        } catch (e) {
          console.log(`[MCPManager] Error disconnecting existing client:`, e);
        }
        this.clients.delete(serverId);
      }
      
      // Clean up event listeners
      this.cleanupServerEventListeners(serverId);
      
      // Create client instance early
      const client = new MCPClient(serverId, config);
      this.clients.set(serverId, client);
      
      // Set up event listeners BEFORE starting server to avoid race condition
      await this.setupServerEventListeners(serverId);
      
      // Update status
      this.status.set(serverId, 'connecting');
      this.emitStatusChange(serverId, 'connecting');
      
      // Now start the server
      console.log(`[MCPManager] Starting server ${serverId}`);
      await invoke('start_mcp_server', {
        serverId,
        config
      });
      
      // Poll for status after a short delay to ensure we catch the connection
      setTimeout(async () => {
        console.log(`[MCPManager] Checking status for ${serverId} after delay...`);
        try {
          const info = await invoke('get_mcp_server_info', { serverId });
          console.log(`[MCPManager] Server info for ${serverId}:`, info);
          
          // The Rust backend returns status as an object with a 'status' field
          const statusValue = typeof info.status === 'object' ? info.status.status : info.status;
          console.log(`[MCPManager] Status value: ${statusValue}`);
          
          if (statusValue === 'Connected' || statusValue === 'connected') {
            console.log(`[MCPManager] Server ${serverId} is connected, updating status`);
            this.status.set(serverId, 'connected');
            this.emitStatusChange(serverId, 'connected');
          }
        } catch (error) {
          console.error(`[MCPManager] Failed to get server info:`, error);
        }
      }, 2000);
      
    } catch (error) {
      console.error(`[MCPManager] Failed to connect to ${serverId}:`, error);
      this.status.set(serverId, 'error');
      this.emitStatusChange(serverId, 'error', error.message);
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   * @param {string} serverId - Server to disconnect
   */
  async disconnectServer(serverId) {
    console.log(`[MCPManager] Disconnecting from server: ${serverId}`);
    
    try {
      // Stop server via Tauri backend
      await invoke('stop_mcp_server', { serverId });
      
      // Clean up client
      const client = this.clients.get(serverId);
      if (client) {
        await client.disconnect();
        this.clients.delete(serverId);
      }
      
      // Clean up event listeners
      this.cleanupServerEventListeners(serverId);
      
      // Update status
      this.status.set(serverId, 'disconnected');
      this.emitStatusChange(serverId, 'disconnected');
      
    } catch (error) {
      console.error(`[MCPManager] Failed to disconnect ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Reconnect to a server
   * @param {string} serverId - Server to reconnect
   */
  async reconnectServer(serverId) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    await this.disconnectServer(serverId);
    await this.connectServer(serverId, client.config);
  }

  /**
   * Invoke a tool on a server
   * @param {string} serverId - Server ID
   * @param {string} toolName - Tool to invoke
   * @param {Object} params - Tool parameters
   * @returns {Promise<Object>} Tool result
   */
  async invokeTool(serverId, toolName, params) {
    console.log(`[MCPManager] Invoking tool ${toolName} on ${serverId}`, params);
    
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }
    
    // Create tool invocation request
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      }
    };
    
    // Send via client
    const response = await client.request(request);
    
    if (response.error) {
      throw new Error(`Tool invocation failed: ${response.error.message}`);
    }
    
    return response.result;
  }

  /**
   * Read a resource from a server
   * @param {string} serverId - Server ID
   * @param {string} resourceUri - Resource URI
   * @returns {Promise<Object>} Resource content
   */
  async readResource(serverId, resourceUri) {
    console.log(`[MCPManager] Reading resource ${resourceUri} from ${serverId}`);
    
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/read',
      params: {
        uri: resourceUri
      }
    };
    
    const response = await client.request(request);
    
    if (response.error) {
      throw new Error(`Resource read failed: ${response.error.message}`);
    }
    
    return response.result;
  }

  /**
   * List available tools from a server
   * @param {string} serverId - Server ID
   * @returns {Promise<Array>} List of tools
   */
  async listTools(serverId) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/list',
      params: {}
    };
    
    const response = await client.request(request);
    
    if (response.error) {
      throw new Error(`Failed to list tools: ${response.error.message}`);
    }
    
    return response.result.tools || [];
  }

  /**
   * List available resources from a server
   * @param {string} serverId - Server ID
   * @returns {Promise<Array>} List of resources
   */
  async listResources(serverId) {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not connected`);
    }
    
    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'resources/list',
      params: {}
    };
    
    const response = await client.request(request);
    
    if (response.error) {
      throw new Error(`Failed to list resources: ${response.error.message}`);
    }
    
    return response.result.resources || [];
  }

  /**
   * Load server configurations
   */
  async loadConfigurations() {
    // TODO: Load from settings storage
    console.log('[MCPManager] Loading configurations...');
  }

  /**
   * Save server configuration
   * @param {string} serverId - Server ID
   * @param {Object} config - Configuration to save
   */
  async saveConfiguration(serverId, config) {
    // TODO: Save to settings storage
    console.log(`[MCPManager] Saving configuration for ${serverId}`, config);
  }

  /**
   * Delete server configuration
   * @param {string} serverId - Server ID
   */
  async deleteConfiguration(serverId) {
    // TODO: Delete from settings storage
    console.log(`[MCPManager] Deleting configuration for ${serverId}`);
  }

  /**
   * Get tools for a specific server
   * @param {string} serverId - Server ID
   * @returns {Array} List of tools
   */
  async getServerTools(serverId) {
    console.log(`[MCPManager] Getting tools for ${serverId}`);
    
    try {
      // Check if server is connected using our status map
      const currentStatus = this.status.get(serverId);
      const isConnected = 
        (typeof currentStatus === 'object' && currentStatus.status === 'connected') ||
        (typeof currentStatus === 'string' && currentStatus === 'connected');
        
      if (!isConnected) {
        console.log(`[MCPManager] Server ${serverId} not connected`);
        return [];
      }
      
      // Send tools/list request
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      });
      
      const response = await invoke('send_mcp_message', {
        serverId,
        message: message
      });
      
      console.log(`[MCPManager] Got tools response:`, response);
      
      // Parse the JSON response if it's a string
      let parsedResponse = response;
      if (typeof response === 'string') {
        try {
          parsedResponse = JSON.parse(response);
        } catch (e) {
          console.error(`[MCPManager] Failed to parse tools response:`, e);
          return [];
        }
      }
      
      // The response might be the direct result or wrapped in a response object
      let tools = [];
      if (parsedResponse?.tools) {
        tools = parsedResponse.tools;
      } else if (parsedResponse?.result?.tools) {
        tools = parsedResponse.result.tools;
      } else if (Array.isArray(parsedResponse)) {
        tools = parsedResponse;
      }
      
      console.log(`[MCPManager] Extracted ${tools.length} tools for ${serverId}:`, tools);
      return tools;
      
    } catch (error) {
      console.error(`[MCPManager] Failed to get tools for ${serverId}:`, error);
      return [];
    }
  }
  
  /**
   * Get resources for a specific server
   * @param {string} serverId - Server ID
   * @returns {Array} List of resources
   */
  async getServerResources(serverId) {
    console.log(`[MCPManager] Getting resources for ${serverId}`);
    
    try {
      // Check if server is connected using our status map
      const currentStatus = this.status.get(serverId);
      const isConnected = 
        (typeof currentStatus === 'object' && currentStatus.status === 'connected') ||
        (typeof currentStatus === 'string' && currentStatus === 'connected');
        
      if (!isConnected) {
        console.log(`[MCPManager] Server ${serverId} not connected`);
        return [];
      }
      
      // Send resources/list request
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'resources/list',
        params: {}
      });
      
      const response = await invoke('send_mcp_message', {
        serverId,
        message: message
      });
      
      console.log(`[MCPManager] Got resources response:`, response);
      
      // Parse the JSON response if it's a string
      let parsedResponse = response;
      if (typeof response === 'string') {
        try {
          parsedResponse = JSON.parse(response);
        } catch (e) {
          console.error(`[MCPManager] Failed to parse resources response:`, e);
          return [];
        }
      }
      
      // The response might be the direct result or wrapped in a response object
      let resources = [];
      if (parsedResponse?.resources) {
        resources = parsedResponse.resources;
      } else if (parsedResponse?.result?.resources) {
        resources = parsedResponse.result.resources;
      } else if (Array.isArray(parsedResponse)) {
        resources = parsedResponse;
      }
      
      console.log(`[MCPManager] Extracted ${resources.length} resources for ${serverId}:`, resources);
      return resources;
      
    } catch (error) {
      console.error(`[MCPManager] Failed to get resources for ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Refresh server statuses
   */
  async refreshStatuses() {
    try {
      const statuses = await invoke('get_mcp_server_statuses');
      
      // Update local status map
      for (const [serverId, status] of Object.entries(statuses)) {
        this.status.set(serverId, status);
      }
      
    } catch (error) {
      console.error('[MCPManager] Failed to refresh statuses:', error);
    }
  }

  /**
   * Get server info
   * @param {string} serverId - Server ID
   * @returns {Promise<Object>} Server information
   */
  async getServerInfo(serverId) {
    try {
      const info = await invoke('get_mcp_server_info', { serverId });
      return info;
    } catch (error) {
      console.error(`[MCPManager] Failed to get info for ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Set up event listeners for a server
   * @param {string} serverId - Server ID
   */
  async setupServerEventListeners(serverId) {
    // Listen for server connection
    const connectUnlisten = await listen(`mcp-server-connected-${serverId}`, (event) => {
      console.log(`[MCPManager] 🎉 Server ${serverId} CONNECTED event received!`, event.payload);
      this.status.set(serverId, 'connected');
      this.capabilities.set(serverId, event.payload.capabilities);
      this.emitStatusChange(serverId, 'connected');
      console.log(`[MCPManager] Status updated to connected for ${serverId}`);
    });
    
    // Listen for server messages
    const messageUnlisten = await listen(`mcp-message-${serverId}`, (event) => {
      console.log(`[MCPManager] Message from ${serverId}`, event.payload);
      this.handleServerMessage(serverId, event.payload);
    });
    
    // Listen for server stop
    const stopUnlisten = await listen(`mcp-server-stopped-${serverId}`, (event) => {
      console.log(`[MCPManager] Server ${serverId} stopped`);
      this.status.set(serverId, 'stopped');
      this.emitStatusChange(serverId, 'stopped');
    });
    
    // Store unsubscribers
    this.eventUnsubscribers.set(`${serverId}-connect`, connectUnlisten);
    this.eventUnsubscribers.set(`${serverId}-message`, messageUnlisten);
    this.eventUnsubscribers.set(`${serverId}-stop`, stopUnlisten);
  }

  /**
   * Clean up event listeners for a server
   * @param {string} serverId - Server ID
   */
  cleanupServerEventListeners(serverId) {
    // Unsubscribe from events
    const connectUnsub = this.eventUnsubscribers.get(`${serverId}-connect`);
    const messageUnsub = this.eventUnsubscribers.get(`${serverId}-message`);
    const stopUnsub = this.eventUnsubscribers.get(`${serverId}-stop`);
    
    if (connectUnsub) connectUnsub();
    if (messageUnsub) messageUnsub();
    if (stopUnsub) stopUnsub();
    
    // Remove from map
    this.eventUnsubscribers.delete(`${serverId}-connect`);
    this.eventUnsubscribers.delete(`${serverId}-message`);
    this.eventUnsubscribers.delete(`${serverId}-stop`);
  }

  /**
   * Handle message from server
   * @param {string} serverId - Server ID
   * @param {Object} message - JSON-RPC message
   */
  handleServerMessage(serverId, message) {
    // Forward to appropriate client
    const client = this.clients.get(serverId);
    if (client) {
      client.handleMessage(message);
    }
  }

  /**
   * Emit status change event
   * @param {string} serverId - Server ID
   * @param {string} status - New status
   * @param {string} [error] - Error message if status is 'error'
   */
  emitStatusChange(serverId, status, error) {
    const event = new CustomEvent('status-change', {
      detail: { serverId, status, error }
    });
    this.eventEmitter.dispatchEvent(event);
    
    // Update MCP status bar
    if (window.updateMCPStatus) {
      window.updateMCPStatus();
    }
    
    // Notify all status change callbacks
    this.statusChangeCallbacks.forEach(callback => {
      try {
        callback(serverId, status, error);
      } catch (err) {
        console.error('Error in status change callback:', err);
      }
    });
    
    // Update chat panel MCP indicator if available
    if (window.chatPanel && typeof window.chatPanel.updateMCPIndicator === 'function') {
      // Defer slightly to ensure DOM is ready
      setTimeout(() => {
        if (window.chatPanel && typeof window.chatPanel.updateMCPIndicator === 'function') {
          window.chatPanel.updateMCPIndicator();
        }
      }, 50);
    }
  }

  /**
   * Listen for events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  on(event, handler) {
    this.eventEmitter.addEventListener(event, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  off(event, handler) {
    this.eventEmitter.removeEventListener(event, handler);
  }

  /**
   * Register a callback for status changes
   * @param {Function} callback - Callback function (serverId, status, error)
   */
  onStatusChange(callback) {
    this.statusChangeCallbacks.add(callback);
  }
  
  /**
   * Unregister a status change callback
   * @param {Function} callback - Callback function to remove
   */
  offStatusChange(callback) {
    this.statusChangeCallbacks.delete(callback);
  }
  
  /**
   * Emit custom event
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emit(event, data) {
    const customEvent = new CustomEvent(event, { detail: data });
    this.eventEmitter.dispatchEvent(customEvent);
  }
}

// Create singleton instance
export const mcpManager = new MCPManager();