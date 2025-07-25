import { mcpManager } from './MCPManager.js';

/**
 * MCP Tool Handler
 * Integrates MCP tools with AI chat, allowing AI to use available tools
 */
export class MCPToolHandler {
  constructor() {
    this.availableTools = new Map();
    this.toolExecutionHistory = [];
  }

  /**
   * Get all available tools from connected MCP servers
   * @returns {Array} Array of tool definitions with server info
   */
  async getAvailableTools() {
    const tools = [];
    
    try {
      // Get status of all servers
      await mcpManager.refreshStatuses();
      
      // For each connected server, get its tools
      console.log(`[MCPToolHandler] Checking servers, status map:`, Array.from(mcpManager.status.entries()));
      
      for (const [serverId, status] of mcpManager.status.entries()) {
        console.log(`[MCPToolHandler] Server ${serverId} status:`, status);
        // Handle both string status and object status from backend
        const isConnected = status === 'connected' || 
                          (typeof status === 'object' && status.status === 'connected');
        
        if (isConnected) {
          try {
            console.log(`[MCPToolHandler] Getting tools for connected server: ${serverId}`);
            const serverTools = await mcpManager.listTools(serverId);
            console.log(`[MCPToolHandler] Found ${serverTools.length} tools from ${serverId}`);
            
            // Add server info to each tool
            const enhancedTools = serverTools.map(tool => ({
              ...tool,
              serverId,
              serverName: serverId, // TODO: Get actual server name from settings
              // Format for OpenAI function calling
              function: {
                name: `${serverId}_${tool.name}`,
                description: tool.description,
                parameters: tool.inputSchema || {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }
            }));
            
            tools.push(...enhancedTools);
            
            // Store in local map for quick access
            enhancedTools.forEach(tool => {
              this.availableTools.set(`${serverId}_${tool.name}`, tool);
            });
            
          } catch (error) {
            console.error(`Failed to get tools from ${serverId}:`, error);
          }
        }
      }
      
      console.log(`Found ${tools.length} available MCP tools`);
    } catch (error) {
      console.error('Failed to get available tools:', error);
    }
    
    return tools;
  }

  /**
   * Format tools for OpenAI function calling
   * @returns {Array} OpenAI-compatible function definitions
   */
  async getOpenAIFunctions() {
    const tools = await this.getAvailableTools();
    return tools.map(tool => tool.function);
  }

  /**
   * Execute a tool call
   * @param {string} functionName - The function name (format: serverId_toolName)
   * @param {Object} args - The function arguments
   * @returns {Object} Tool execution result
   */
  async executeTool(functionName, args) {
    console.log(`Executing MCP tool: ${functionName}`, args);
    
    const tool = this.availableTools.get(functionName);
    if (!tool) {
      throw new Error(`Tool not found: ${functionName}`);
    }
    
    // Track tool execution
    if (window.onMCPToolExecuted) {
      window.onMCPToolExecuted(functionName);
    }
    
    try {
      // Execute the tool via MCP manager
      const result = await mcpManager.invokeTool(tool.serverId, tool.name, args);
      
      // Log execution for history
      this.toolExecutionHistory.push({
        timestamp: new Date(),
        serverId: tool.serverId,
        toolName: tool.name,
        args,
        result,
        success: true
      });
      
      // Format result for AI consumption
      return {
        success: true,
        serverId: tool.serverId,
        serverName: tool.serverName,
        toolName: tool.name,
        result: this.formatToolResult(result)
      };
      
    } catch (error) {
      console.error(`Tool execution failed:`, error);
      
      // Log failure
      this.toolExecutionHistory.push({
        timestamp: new Date(),
        serverId: tool.serverId,
        toolName: tool.name,
        args,
        error: error.message,
        success: false
      });
      
      return {
        success: false,
        serverId: tool.serverId,
        serverName: tool.serverName,
        toolName: tool.name,
        error: error.message
      };
    }
  }

  /**
   * Format tool result for AI consumption
   * @param {Object} result - Raw tool result
   * @returns {string} Formatted result
   */
  formatToolResult(result) {
    if (!result || !result.content) {
      return 'No result returned';
    }
    
    // Handle different content types
    const contentItems = Array.isArray(result.content) ? result.content : [result.content];
    
    const formattedParts = contentItems.map(item => {
      if (item.type === 'text') {
        return item.text;
      } else if (item.type === 'image') {
        return `[Image: ${item.data || item.url}]`;
      } else if (item.type === 'resource') {
        return `[Resource: ${item.uri}]`;
      } else {
        return JSON.stringify(item);
      }
    });
    
    return formattedParts.join('\n');
  }

  /**
   * Get tool execution history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Recent tool executions
   */
  getHistory(limit = 50) {
    return this.toolExecutionHistory.slice(-limit);
  }

  /**
   * Clear tool execution history
   */
  clearHistory() {
    this.toolExecutionHistory = [];
  }

  /**
   * Get system prompt additions for MCP tools
   * @returns {string} Additional system prompt content
   */
  async getSystemPromptAdditions() {
    const tools = await this.getAvailableTools();
    
    if (tools.length === 0) {
      return '';
    }
    
    let prompt = '\n\n## Available MCP Tools\n\n';
    prompt += 'You have access to the following Model Context Protocol (MCP) tools:\n\n';
    
    // Group tools by server
    const toolsByServer = {};
    tools.forEach(tool => {
      if (!toolsByServer[tool.serverName]) {
        toolsByServer[tool.serverName] = [];
      }
      toolsByServer[tool.serverName].push(tool);
    });
    
    // Format tools by server
    for (const [serverName, serverTools] of Object.entries(toolsByServer)) {
      prompt += `### ${serverName}\n`;
      serverTools.forEach(tool => {
        prompt += `- **${tool.name}**: ${tool.description}\n`;
      });
      prompt += '\n';
    }
    
    prompt += 'When you need to perform actions that these tools can help with, ';
    prompt += 'you can use them by calling the appropriate function. ';
    prompt += 'Always explain what you\'re doing when using tools.\n\n';
    
    prompt += '### Important File Operation Guidelines:\n';
    prompt += '- When asked to list "all files" or "what files are in vault", use **search_files** with pattern "*" for a recursive listing\n';
    prompt += '- The **list_files** tool only shows files in ONE directory - it does NOT recursively list subdirectories\n';
    prompt += '- For comprehensive file listings, always prefer **search_files** over **list_files**\n';
    prompt += '- Use "." for the vault root directory, not "root"\n';
    
    return prompt;
  }

  /**
   * Create a tool usage display element for the chat
   * @param {string} toolName - Name of the tool being used
   * @param {string} serverName - Name of the server
   * @param {string} status - Status of the tool execution
   * @returns {HTMLElement} Tool usage display element
   */
  createToolUsageDisplay(toolName, serverName, status = 'running') {
    const display = document.createElement('div');
    display.className = 'mcp-tool-usage';
    
    const statusIcon = status === 'running' ? '🔄' : 
                      status === 'success' ? '✅' : '❌';
    
    display.innerHTML = `
      <div class="tool-usage-header">
        <span class="tool-icon">🔧</span>
        <span class="tool-name">Using Tool: ${toolName}</span>
        <span class="tool-server">(${serverName})</span>
        <span class="tool-status${status === 'running' ? ' spinning' : ''}">${statusIcon}</span>
      </div>
      <div class="tool-usage-status">
        ${status === 'running' ? 'Executing...' : 
          status === 'success' ? 'Completed successfully' : 'Failed'}
      </div>
    `;
    
    // Add styles if not already present
    this.addToolUsageStyles();
    
    return display;
  }

  /**
   * Add styles for tool usage display
   */
  addToolUsageStyles() {
    if (document.getElementById('mcp-tool-usage-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'mcp-tool-usage-styles';
    style.textContent = `
      .mcp-tool-usage {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        padding: 12px;
        margin: 8px 0;
        font-size: 13px;
      }
      
      .tool-usage-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      
      .tool-icon {
        font-size: 16px;
      }
      
      .tool-name {
        font-weight: 500;
        color: var(--text-primary);
      }
      
      .tool-server {
        color: var(--text-secondary);
        font-size: 12px;
      }
      
      .tool-status {
        margin-left: auto;
        font-size: 16px;
      }
      
      .tool-usage-status {
        color: var(--text-secondary);
        font-size: 12px;
        margin-left: 24px;
      }
      
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .tool-status.spinning {
        animation: spin 1s linear infinite;
        display: inline-block;
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Create singleton instance
export const mcpToolHandler = new MCPToolHandler();