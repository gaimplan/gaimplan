#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Get vault path from environment or use current directory
const VAULT_PATH = process.env.VAULT_PATH || process.cwd();

console.error(`[Filesystem Server] Starting with vault path: ${VAULT_PATH}`);

// Create server instance
const server = new Server(
  {
    name: 'gaimplan-filesystem',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Error handling
server.onerror = (error) => {
  console.error('[Filesystem Server] Error:', error);
};

// Helper function to ensure path is within vault
function ensureInVault(targetPath) {
  const resolvedPath = path.resolve(VAULT_PATH, targetPath);
  const resolvedVault = path.resolve(VAULT_PATH);
  
  if (!resolvedPath.startsWith(resolvedVault)) {
    throw new Error('Path is outside vault directory');
  }
  
  return resolvedPath;
}

// Register tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_files',
        description: 'List files and directories in a given path within the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path relative to vault root (default: root)',
              default: '.'
            },
            include_hidden: {
              type: 'boolean',
              description: 'Include hidden files (starting with .)',
              default: false
            }
          }
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file relative to vault root'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'write_file',
        description: 'Write or update a file in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file relative to vault root'
            },
            content: {
              type: 'string',
              description: 'Content to write to the file'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'create_directory',
        description: 'Create a new directory in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to directory relative to vault root'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file or empty directory in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to file or directory relative to vault root'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'move_file',
        description: 'Move or rename a file or directory in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'Source path relative to vault root'
            },
            destination: {
              type: 'string',
              description: 'Destination path relative to vault root'
            }
          },
          required: ['source', 'destination']
        }
      },
      {
        name: 'search_files',
        description: 'Search for files by name pattern in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Search pattern (supports * and ? wildcards)'
            },
            path: {
              type: 'string',
              description: 'Starting path for search (default: root)',
              default: '.'
            }
          },
          required: ['pattern']
        }
      }
    ]
  };
});

// Tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'list_files': {
        const dirPath = ensureInVault(args.path || '.');
        const includeHidden = args.include_hidden || false;
        
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const files = [];
        
        for (const entry of entries) {
          if (!includeHidden && entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(fullPath);
          const relativePath = path.relative(VAULT_PATH, fullPath);
          
          files.push({
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(files, null, 2)
          }]
        };
      }
      
      case 'read_file': {
        const filePath = ensureInVault(args.path);
        const content = await fs.readFile(filePath, 'utf-8');
        
        return {
          content: [{
            type: 'text',
            text: content
          }]
        };
      }
      
      case 'write_file': {
        const filePath = ensureInVault(args.path);
        
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        
        await fs.writeFile(filePath, args.content, 'utf-8');
        
        return {
          content: [{
            type: 'text',
            text: `File written successfully: ${args.path}`
          }]
        };
      }
      
      case 'create_directory': {
        const dirPath = ensureInVault(args.path);
        await fs.mkdir(dirPath, { recursive: true });
        
        return {
          content: [{
            type: 'text',
            text: `Directory created: ${args.path}`
          }]
        };
      }
      
      case 'delete_file': {
        const filePath = ensureInVault(args.path);
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          await fs.rmdir(filePath);
        } else {
          await fs.unlink(filePath);
        }
        
        return {
          content: [{
            type: 'text',
            text: `Deleted: ${args.path}`
          }]
        };
      }
      
      case 'move_file': {
        const sourcePath = ensureInVault(args.source);
        const destPath = ensureInVault(args.destination);
        
        // Create destination directory if needed
        const destDir = path.dirname(destPath);
        await fs.mkdir(destDir, { recursive: true });
        
        await fs.rename(sourcePath, destPath);
        
        return {
          content: [{
            type: 'text',
            text: `Moved ${args.source} to ${args.destination}`
          }]
        };
      }
      
      case 'search_files': {
        const searchPath = ensureInVault(args.path || '.');
        const pattern = args.pattern;
        
        // Convert wildcard pattern to regex
        const regex = new RegExp(
          pattern.replace(/\*/g, '.*').replace(/\?/g, '.'),
          'i'
        );
        
        const results = [];
        
        async function searchDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(VAULT_PATH, fullPath);
            
            if (regex.test(entry.name)) {
              results.push({
                name: entry.name,
                path: relativePath,
                type: entry.isDirectory() ? 'directory' : 'file'
              });
            }
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            }
          }
        }
        
        await searchDir(searchPath);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error.message}`
      }],
      isError: true
    };
  }
});

// Resources handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'file://vault-info',
        name: 'Vault Information',
        description: 'Information about the current vault',
        mimeType: 'application/json'
      }
    ]
  };
});

// Read resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'file://vault-info') {
    const stats = await fs.stat(VAULT_PATH);
    const entries = await fs.readdir(VAULT_PATH);
    
    const info = {
      path: VAULT_PATH,
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString(),
      totalFiles: entries.length,
      isWritable: true
    };
    
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(info, null, 2)
      }]
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Filesystem Server] Connected and ready');
  
  // Keep the process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('[Filesystem Server] Fatal error:', error);
  process.exit(1);
});