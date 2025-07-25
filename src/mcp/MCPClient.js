import { invoke } from '@tauri-apps/api/core';

/**
 * MCP Client wrapper for individual server connections
 */
export class MCPClient {
  constructor(serverId, config) {
    /** @type {string} */
    this.serverId = serverId;
    
    /** @type {Object} */
    this.config = config;
    
    /** @type {boolean} */
    this.connected = false;
    
    /** @type {Map<number, Object>} */
    this.pendingRequests = new Map();
    
    /** @type {number} */
    this.nextRequestId = 1;
  }

  /**
   * Send a request to the server
   * @param {Object} request - JSON-RPC request
   * @returns {Promise<Object>} JSON-RPC response
   */
  async request(request) {
    // Ensure request has an ID if not provided
    if (!request.id) {
      request.id = this.nextRequestId++;
    }
    
    // Create promise for response
    const responsePromise = new Promise((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
    
    try {
      // Send via Tauri
      const responseStr = await invoke('send_mcp_message', {
        serverId: this.serverId,
        message: JSON.stringify(request)
      });
      
      // Parse response
      const response = JSON.parse(responseStr);
      
      // Resolve immediately since Tauri waits for response
      const pending = this.pendingRequests.get(request.id);
      if (pending) {
        this.pendingRequests.delete(request.id);
        pending.resolve(response);
      }
      
      return response;
      
    } catch (error) {
      // Clean up pending request
      const pending = this.pendingRequests.get(request.id);
      if (pending) {
        this.pendingRequests.delete(request.id);
        pending.reject(error);
      }
      throw error;
    }
  }

  /**
   * Send a notification to the server (no response expected)
   * @param {Object} notification - JSON-RPC notification
   */
  async notify(notification) {
    // Notifications don't have IDs
    delete notification.id;
    
    try {
      await invoke('send_mcp_message', {
        serverId: this.serverId,
        message: JSON.stringify(notification)
      });
    } catch (error) {
      console.error(`[MCPClient] Failed to send notification to ${this.serverId}:`, error);
      throw error;
    }
  }

  /**
   * Handle incoming message from server
   * @param {Object} message - JSON-RPC message
   */
  handleMessage(message) {
    // Check if it's a response to a pending request
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message);
      }
    } else {
      // It's a notification or request from server
      console.log(`[MCPClient] Received message from ${this.serverId}:`, message);
      // TODO: Handle server-initiated requests/notifications
    }
  }

  /**
   * Disconnect the client
   */
  async disconnect() {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
    
    this.connected = false;
  }

  /**
   * Get connection status
   * @returns {boolean} Connection status
   */
  isConnected() {
    return this.connected;
  }
}