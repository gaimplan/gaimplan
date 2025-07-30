/**
 * Generate vault ID from path (matches backend logic)
 * @param {string} vaultPath - Path to vault
 * @returns {string} 8-character vault ID
 */
function generateVaultId(vaultPath) {
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
 * Bundled MCP servers that come pre-configured with gaimplan
 */
export const bundledServers = [
  {
    id: 'gaimplan-filesystem',
    name: 'Filesystem Tools',
    description: 'File operations within your vault - list, read, write, search files',
    enabled: false, // Disabled by default - user should test and enable
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/filesystem-server/index.js'],
      env: {
        VAULT_PATH: '${VAULT_PATH}' // Will be replaced with actual vault path
      },
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
      write: true,
      delete: true,
      external_access: false
    }
  },
  {
    id: 'gaimplan-search',
    name: 'Search & Analysis',
    description: 'Search content, find tags, extract highlights, analyze links',
    enabled: false, // Disabled by default - user should test and enable
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/search-server/index.js'],
      env: {
        VAULT_PATH: '${VAULT_PATH}'
      },
      working_dir: null
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      sampling: false
    },
    permissions: {
      read: true,
      write: false,
      delete: false,
      external_access: false
    }
  },
  {
    id: 'gaimplan-git',
    name: 'Git Version Control',
    description: 'Git operations - commit, branch, diff, push/pull',
    enabled: false, // Disabled by default as not all vaults use git
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/git-server/index.js'],
      env: {
        VAULT_PATH: '${VAULT_PATH}'
      },
      working_dir: null
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      sampling: false
    },
    permissions: {
      read: true,
      write: true,
      delete: false,
      external_access: true // For push/pull operations
    }
  },
  {
    id: 'gaimplan-neo4j',
    name: 'Neo4j Knowledge Graph',
    description: 'Query and explore your knowledge graph - find patterns, relationships, and insights',
    enabled: false, // Disabled by default - requires Neo4j to be running
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/neo4j/index.js'],
      env: {
        VAULT_ID: '${VAULT_ID}', // Will be replaced with actual vault ID
        NEO4J_URI: '${NEO4J_URI}', // Will be replaced with actual URI
        NEO4J_USER: '${NEO4J_USER}', // Will be replaced with actual username
        NEO4J_PASSWORD: '${NEO4J_PASSWORD}' // Will be replaced with actual password
      },
      working_dir: null
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      sampling: false
    },
    permissions: {
      read: true,
      write: false, // Read-only for safety
      delete: false,
      external_access: false
    }
  },
  {
    id: 'gaimplan-qdrant',
    name: 'Qdrant Semantic Memory',
    description: 'Semantic search and memory - store sessions, find patterns, discover cross-domain knowledge',
    enabled: false, // Disabled by default - requires Qdrant to be running
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['./mcp-servers/qdrant-server/dist/index.js'],
      env: {
        VAULT_ID: '${VAULT_ID}', // Will be replaced with actual vault ID
        VAULT_NAME: '${VAULT_NAME}', // Will be replaced with actual vault name
        QDRANT_URL: 'http://localhost:6333',
        TRANSFORMERS_CACHE: './models'
      },
      working_dir: null
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
      sampling: false
    },
    permissions: {
      read: true,
      write: true, // Needs write to store embeddings
      delete: false,
      external_access: false
    }
  }
];

/**
 * Get bundled servers with vault path substituted
 */
export async function getBundledServers(vaultPath) {
  // Generate vault ID from path (same logic as backend)
  const vaultId = generateVaultId(vaultPath);
  
  // Extract vault name from path (last component)
  const vaultName = vaultPath.split('/').pop() || vaultPath.split('\\').pop() || 'default';
  
  // Try to load Neo4j connection info from backend
  let neo4jConfig = {
    uri: 'bolt://localhost:7687',
    user: 'neo4j',
    password: 'GaimplanKnowledgeGraph2025'
  };
  
  try {
    // Get connection info from Rust backend
    const { invoke } = window.__TAURI__.core;
    const connInfo = await invoke('get_neo4j_connection_info');
    if (connInfo) {
      neo4jConfig = {
        uri: connInfo.uri || neo4jConfig.uri,
        user: connInfo.username || neo4jConfig.user,
        password: connInfo.password || neo4jConfig.password
      };
      console.log('🔧 [MCP] Loaded Neo4j connection info from shared Docker setup');
    }
  } catch (error) {
    console.log('🔧 [MCP] Using default Neo4j connection info:', error.message);
  }
  
  return bundledServers.map(server => {
    // Deep clone the server config
    const config = JSON.parse(JSON.stringify(server));
    
    // Replace environment variable placeholders
    if (config.transport.env) {
      Object.keys(config.transport.env).forEach(key => {
        if (config.transport.env[key] === '${VAULT_PATH}') {
          config.transport.env[key] = vaultPath;
        } else if (config.transport.env[key] === '${VAULT_ID}') {
          config.transport.env[key] = vaultId;
        } else if (config.transport.env[key] === '${NEO4J_URI}') {
          config.transport.env[key] = neo4jConfig.uri;
        } else if (config.transport.env[key] === '${NEO4J_USER}') {
          config.transport.env[key] = neo4jConfig.user;
        } else if (config.transport.env[key] === '${NEO4J_PASSWORD}') {
          config.transport.env[key] = neo4jConfig.password;
        } else if (config.transport.env[key] === '${VAULT_NAME}') {
          config.transport.env[key] = vaultName;
        }
      });
    }
    
    // The Rust backend will resolve these paths relative to the app's resource directory
    // Keep them as relative paths for portability
    // Debug: Log the configuration being used
    console.log(`🔧 [MCP] Configured server ${config.id} with args:`, config.transport.args);
    if (config.id === 'gaimplan-neo4j') {
      console.log(`🔧 [MCP] Neo4j server environment:`, config.transport.env);
    }
    
    return config;
  });
}

/**
 * Check if bundled servers need to be installed
 */
export async function shouldInstallBundledServers(servers) {
  const installedIds = new Set(Array.from(servers.keys()));
  
  // Check if any bundled servers are missing
  return bundledServers.some(server => !installedIds.has(server.id));
}