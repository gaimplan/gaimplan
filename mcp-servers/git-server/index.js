#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { simpleGit } from 'simple-git';
import path from 'path';

// Get vault path from environment or use current directory
const VAULT_PATH = process.env.VAULT_PATH || process.cwd();

console.error(`[Git Server] Starting with vault path: ${VAULT_PATH}`);

// Initialize git instance
const git = simpleGit(VAULT_PATH);

// Create server instance
const server = new Server(
  {
    name: 'gaimplan-git',
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
  console.error('[Git Server] Error:', error);
};

// Register tools list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'git_status',
        description: 'Get the current git status of the vault',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'git_add',
        description: 'Stage files for commit',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Files to stage (use "." for all files)'
            }
          },
          required: ['files']
        }
      },
      {
        name: 'git_commit',
        description: 'Create a commit with staged changes',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Commit message'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'git_diff',
        description: 'Show differences in files',
        inputSchema: {
          type: 'object',
          properties: {
            staged: {
              type: 'boolean',
              description: 'Show staged changes instead of unstaged',
              default: false
            },
            file: {
              type: 'string',
              description: 'Specific file to show diff for'
            }
          }
        }
      },
      {
        name: 'git_log',
        description: 'Show commit history',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of commits to show',
              default: 10
            },
            oneline: {
              type: 'boolean',
              description: 'Show in compact format',
              default: true
            }
          }
        }
      },
      {
        name: 'git_branch',
        description: 'List or create branches',
        inputSchema: {
          type: 'object',
          properties: {
            create: {
              type: 'string',
              description: 'Name of branch to create'
            },
            checkout: {
              type: 'string',
              description: 'Branch to checkout'
            },
            list: {
              type: 'boolean',
              description: 'List all branches',
              default: true
            }
          }
        }
      },
      {
        name: 'git_push',
        description: 'Push commits to remote repository',
        inputSchema: {
          type: 'object',
          properties: {
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin'
            },
            branch: {
              type: 'string',
              description: 'Branch to push (default: current branch)'
            }
          }
        }
      },
      {
        name: 'git_pull',
        description: 'Pull changes from remote repository',
        inputSchema: {
          type: 'object',
          properties: {
            remote: {
              type: 'string',
              description: 'Remote name',
              default: 'origin'
            },
            branch: {
              type: 'string',
              description: 'Branch to pull'
            }
          }
        }
      },
      {
        name: 'git_init',
        description: 'Initialize a new git repository in the vault',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'git_stash',
        description: 'Stash or restore uncommitted changes',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['save', 'pop', 'list'],
              description: 'Stash action to perform',
              default: 'save'
            },
            message: {
              type: 'string',
              description: 'Message for stash save'
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
      case 'git_status': {
        const status = await git.status();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              branch: status.current,
              ahead: status.ahead,
              behind: status.behind,
              staged: status.staged,
              modified: status.modified,
              deleted: status.deleted,
              created: status.created,
              renamed: status.renamed,
              untracked: status.not_added,
              conflicted: status.conflicted
            }, null, 2)
          }]
        };
      }
      
      case 'git_add': {
        await git.add(args.files);
        return {
          content: [{
            type: 'text',
            text: `Staged files: ${args.files.join(', ')}`
          }]
        };
      }
      
      case 'git_commit': {
        const result = await git.commit(args.message);
        return {
          content: [{
            type: 'text',
            text: `Committed: ${result.commit}\nBranch: ${result.branch}\nChanges: ${result.summary.changes} files, +${result.summary.insertions} -${result.summary.deletions}`
          }]
        };
      }
      
      case 'git_diff': {
        let diffArgs = [];
        if (args.staged) diffArgs.push('--staged');
        if (args.file) diffArgs.push('--', args.file);
        
        const diff = await git.diff(diffArgs);
        return {
          content: [{
            type: 'text',
            text: diff || 'No changes'
          }]
        };
      }
      
      case 'git_log': {
        const options = {
          maxCount: args.limit,
          oneline: args.oneline
        };
        
        const log = await git.log(options);
        const formatted = log.all.map(commit => {
          if (args.oneline) {
            return `${commit.hash.substring(0, 7)} ${commit.message}`;
          }
          return {
            hash: commit.hash,
            date: commit.date,
            author: commit.author_name,
            message: commit.message
          };
        });
        
        return {
          content: [{
            type: 'text',
            text: args.oneline ? formatted.join('\n') : JSON.stringify(formatted, null, 2)
          }]
        };
      }
      
      case 'git_branch': {
        if (args.create) {
          await git.checkoutLocalBranch(args.create);
          return {
            content: [{
              type: 'text',
              text: `Created and switched to branch: ${args.create}`
            }]
          };
        }
        
        if (args.checkout) {
          await git.checkout(args.checkout);
          return {
            content: [{
              type: 'text',
              text: `Switched to branch: ${args.checkout}`
            }]
          };
        }
        
        const branches = await git.branch();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              current: branches.current,
              all: branches.all,
              branches: branches.branches
            }, null, 2)
          }]
        };
      }
      
      case 'git_push': {
        const pushArgs = [args.remote];
        if (args.branch) pushArgs.push(args.branch);
        
        const result = await git.push(pushArgs);
        return {
          content: [{
            type: 'text',
            text: `Pushed to ${args.remote}${args.branch ? '/' + args.branch : ''}`
          }]
        };
      }
      
      case 'git_pull': {
        const pullArgs = [args.remote];
        if (args.branch) pullArgs.push(args.branch);
        
        const result = await git.pull(pullArgs);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              files: result.files,
              insertions: result.insertions,
              deletions: result.deletions,
              summary: result.summary
            }, null, 2)
          }]
        };
      }
      
      case 'git_init': {
        await git.init();
        
        // Create a default .gitignore
        const gitignoreContent = `# System files
.DS_Store
Thumbs.db

# gaimplan config
.gaimplan/

# Temporary files
*.tmp
*.swp
*~
`;
        
        const fs = await import('fs/promises');
        await fs.writeFile(path.join(VAULT_PATH, '.gitignore'), gitignoreContent);
        
        return {
          content: [{
            type: 'text',
            text: 'Initialized git repository with default .gitignore'
          }]
        };
      }
      
      case 'git_stash': {
        switch (args.action) {
          case 'save': {
            const stashArgs = ['push'];
            if (args.message) stashArgs.push('-m', args.message);
            await git.stash(stashArgs);
            return {
              content: [{
                type: 'text',
                text: `Stashed changes${args.message ? ': ' + args.message : ''}`
              }]
            };
          }
          
          case 'pop': {
            await git.stash(['pop']);
            return {
              content: [{
                type: 'text',
                text: 'Applied stashed changes'
              }]
            };
          }
          
          case 'list': {
            const stashList = await git.stashList();
            if (stashList.all.length === 0) {
              return {
                content: [{
                  type: 'text',
                  text: 'No stashes found'
                }]
              };
            }
            
            const formatted = stashList.all.map((stash, index) => 
              `stash@{${index}}: ${stash.message}`
            );
            
            return {
              content: [{
                type: 'text',
                text: formatted.join('\n')
              }]
            };
          }
          
          default:
            throw new Error(`Unknown stash action: ${args.action}`);
        }
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
  console.error('[Git Server] Connected and ready');
  
  // Keep the process alive
  process.stdin.resume();
}

main().catch((error) => {
  console.error('[Git Server] Fatal error:', error);
  process.exit(1);
});