#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

// Get vault path from environment or use current directory
const VAULT_PATH = process.env.VAULT_PATH || process.cwd();

console.error(`[Search Server] Starting with vault path: ${VAULT_PATH}`);

// Create server instance
const server = new Server(
  {
    name: 'gaimplan-search',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Error handling
server.onerror = (error) => {
  console.error('[Search Server] Error:', error);
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

// Helper to extract tags from markdown (supports nested tags like #project/client-alpha)
function extractTags(content) {
  const tagRegex = /(?:^|(?<=\s))#([a-zA-Z0-9_][a-zA-Z0-9_/-]*[a-zA-Z0-9_]|[a-zA-Z0-9_])(?=\s|$|[.,!?;:)])/g;
  const tags = new Set();
  let match;
  
  while ((match = tagRegex.exec(content)) !== null) {
    tags.add(match[1]);
  }
  
  return Array.from(tags);
}

// Helper to extract headings
function extractHeadings(content) {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings = [];
  let match;
  
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2]
    });
  }
  
  return headings;
}

// Register tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_content',
        description: 'Search for text content within markdown files in the vault',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query text'
            },
            case_sensitive: {
              type: 'boolean',
              description: 'Whether search should be case sensitive',
              default: false
            },
            whole_word: {
              type: 'boolean',
              description: 'Match whole words only',
              default: false
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of results to return',
              default: 50
            }
          },
          required: ['query']
        }
      },
      {
        name: 'search_by_tag',
        description: 'Find all markdown files containing specific tags',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Tags to search for (without # prefix)'
            },
            match_all: {
              type: 'boolean',
              description: 'Whether to match all tags (AND) or any tag (OR)',
              default: false
            }
          },
          required: ['tags']
        }
      },
      {
        name: 'find_links',
        description: 'Find all links (wiki-style [[]] and markdown []())) in vault',
        inputSchema: {
          type: 'object',
          properties: {
            target: {
              type: 'string',
              description: 'Optional: Find links to specific target'
            },
            include_external: {
              type: 'boolean',
              description: 'Include external URLs',
              default: true
            }
          }
        }
      },
      {
        name: 'find_orphaned_notes',
        description: 'Find notes that have no incoming links',
        inputSchema: {
          type: 'object',
          properties: {
            include_directories: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Directories to include in search (default: all)'
            }
          }
        }
      },
      {
        name: 'extract_highlights',
        description: 'Extract all highlighted text (==text==) from vault',
        inputSchema: {
          type: 'object',
          properties: {
            group_by_file: {
              type: 'boolean',
              description: 'Group highlights by file',
              default: true
            }
          }
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
      case 'search_content': {
        const results = [];
        const query = args.case_sensitive ? args.query : args.query.toLowerCase();
        
        async function searchDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const searchContent = args.case_sensitive ? content : content.toLowerCase();
              
              // Find all occurrences
              const lines = searchContent.split('\n');
              const matches = [];
              
              lines.forEach((line, index) => {
                let searchIndex = 0;
                while (true) {
                  const matchIndex = line.indexOf(query, searchIndex);
                  if (matchIndex === -1) break;
                  
                  // Check whole word if required
                  if (args.whole_word) {
                    const before = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const after = matchIndex + query.length < line.length ? 
                      line[matchIndex + query.length] : ' ';
                    
                    if (/\w/.test(before) || /\w/.test(after)) {
                      searchIndex = matchIndex + 1;
                      continue;
                    }
                  }
                  
                  matches.push({
                    line: index + 1,
                    column: matchIndex + 1,
                    context: content.split('\n')[index].trim()
                  });
                  
                  searchIndex = matchIndex + 1;
                }
              });
              
              if (matches.length > 0) {
                results.push({
                  file: path.relative(VAULT_PATH, fullPath),
                  matches: matches.slice(0, 5), // Limit matches per file
                  totalMatches: matches.length
                });
                
                if (results.length >= args.max_results) return;
              }
            }
          }
        }
        
        await searchDir(VAULT_PATH);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case 'search_by_tag': {
        const results = [];
        const searchTags = args.tags.map(t => t.toLowerCase());
        
        async function searchDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const fileTags = extractTags(content).map(t => t.toLowerCase());
              
              const hasMatch = args.match_all ?
                searchTags.every(tag => fileTags.includes(tag)) :
                searchTags.some(tag => fileTags.includes(tag));
              
              if (hasMatch) {
                results.push({
                  file: path.relative(VAULT_PATH, fullPath),
                  tags: fileTags,
                  matchedTags: fileTags.filter(t => searchTags.includes(t))
                });
              }
            }
          }
        }
        
        await searchDir(VAULT_PATH);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case 'find_links': {
        const results = [];
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        
        async function searchDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const fileLinks = [];
              
              // Find wiki links
              let match;
              while ((match = wikiLinkRegex.exec(content)) !== null) {
                const link = match[1];
                if (!args.target || link.includes(args.target)) {
                  fileLinks.push({
                    type: 'wiki',
                    target: link,
                    text: link
                  });
                }
              }
              
              // Find markdown links
              while ((match = mdLinkRegex.exec(content)) !== null) {
                const text = match[1];
                const url = match[2];
                const isExternal = url.startsWith('http://') || url.startsWith('https://');
                
                if (args.include_external || !isExternal) {
                  if (!args.target || url.includes(args.target) || text.includes(args.target)) {
                    fileLinks.push({
                      type: isExternal ? 'external' : 'internal',
                      target: url,
                      text: text
                    });
                  }
                }
              }
              
              if (fileLinks.length > 0) {
                results.push({
                  file: path.relative(VAULT_PATH, fullPath),
                  links: fileLinks
                });
              }
            }
          }
        }
        
        await searchDir(VAULT_PATH);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        };
      }
      
      case 'find_orphaned_notes': {
        // First, collect all markdown files
        const allFiles = new Set();
        const linkedFiles = new Set();
        
        async function collectFiles(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(VAULT_PATH, fullPath);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              if (!args.include_directories || 
                  args.include_directories.some(d => relativePath.startsWith(d))) {
                await collectFiles(fullPath);
              }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              allFiles.add(relativePath);
              
              // Check for links in this file
              const content = await fs.readFile(fullPath, 'utf-8');
              
              // Wiki links
              const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
              let match;
              while ((match = wikiLinkRegex.exec(content)) !== null) {
                const link = match[1];
                // Convert to file path
                const linkedFile = link.endsWith('.md') ? link : `${link}.md`;
                linkedFiles.add(linkedFile);
              }
              
              // Markdown links to local files
              const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
              while ((match = mdLinkRegex.exec(content)) !== null) {
                const url = match[2];
                if (!url.startsWith('http://') && !url.startsWith('https://') && 
                    url.endsWith('.md')) {
                  linkedFiles.add(url);
                }
              }
            }
          }
        }
        
        await collectFiles(VAULT_PATH);
        
        // Find orphaned files
        const orphaned = Array.from(allFiles).filter(file => !linkedFiles.has(file));
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              totalFiles: allFiles.size,
              linkedFiles: linkedFiles.size,
              orphanedFiles: orphaned
            }, null, 2)
          }]
        };
      }
      
      case 'extract_highlights': {
        const results = args.group_by_file ? {} : [];
        const highlightRegex = /==(.*?)==/g;
        
        async function searchDir(dir) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              await searchDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
              const content = await fs.readFile(fullPath, 'utf-8');
              const fileHighlights = [];
              
              let match;
              while ((match = highlightRegex.exec(content)) !== null) {
                const highlight = match[1].trim();
                if (highlight) {
                  fileHighlights.push(highlight);
                }
              }
              
              if (fileHighlights.length > 0) {
                const relativePath = path.relative(VAULT_PATH, fullPath);
                
                if (args.group_by_file) {
                  results[relativePath] = fileHighlights;
                } else {
                  fileHighlights.forEach(h => {
                    results.push({
                      file: relativePath,
                      highlight: h
                    });
                  });
                }
              }
            }
          }
        }
        
        await searchDir(VAULT_PATH);
        
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Search Server] Connected and ready');
  
  // Keep the process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('[Search Server] Fatal error:', error);
  process.exit(1);
});