# MCP Settings Configuration

This guide explains how to configure MCP (Model Context Protocol) servers for Gaimplan.

## Location

The MCP settings file should be created at:

**macOS**: `~/Library/Application Support/com.gaimplan.app/mcp_settings.json`

**Windows**: `%APPDATA%/com.gaimplan.app/mcp_settings.json`

**Linux**: `~/.config/com.gaimplan.app/mcp_settings.json`

## Creating the Configuration File

1. Navigate to the appropriate directory for your operating system (create it if it doesn't exist):
   ```bash
   # macOS
   mkdir -p ~/Library/Application\ Support/com.gaimplan.app/
   
   # Windows (in PowerShell)
   New-Item -ItemType Directory -Force -Path "$env:APPDATA\com.gaimplan.app"
   
   # Linux
   mkdir -p ~/.config/com.gaimplan.app/
   ```

2. Create the `mcp_settings.json` file in this directory.

## Example Configuration

Here's an example `mcp_settings.json` file with all bundled MCP servers:

```json
{
  "servers": [
    {
      "name": "filesystem-server",
      "command": "node",
      "args": [
        "/Users/REPLACE_USERNAME/Library/Application Support/com.gaimplan.app/mcp-servers/filesystem-server/index.js"
      ],
      "env": {
        "VAULT_PATH": "/path/to/your/vault"
      }
    },
    {
      "name": "search-server", 
      "command": "node",
      "args": [
        "/Users/REPLACE_USERNAME/Library/Application Support/com.gaimplan.app/mcp-servers/search-server/index.js"
      ],
      "env": {
        "VAULT_PATH": "/path/to/your/vault"
      }
    },
    {
      "name": "git-server",
      "command": "node", 
      "args": [
        "/Users/REPLACE_USERNAME/Library/Application Support/com.gaimplan.app/mcp-servers/git-server/index.js"
      ],
      "env": {
        "VAULT_PATH": "/path/to/your/vault"
      }
    },
    {
      "name": "neo4j-server",
      "command": "node",
      "args": [
        "/Users/REPLACE_USERNAME/Library/Application Support/com.gaimplan.app/mcp-servers/neo4j-server/index.js"
      ],
      "env": {
        "NEO4J_URL": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "your-password"
      }
    },
    {
      "name": "qdrant-server",
      "command": "node",
      "args": [
        "/Users/REPLACE_USERNAME/Library/Application Support/com.gaimplan.app/mcp-servers/qdrant-server/index.js"
      ],
      "env": {
        "QDRANT_URL": "http://localhost:6333",
        "QDRANT_API_KEY": "your-api-key"
      }
    }
  ]
}
```

## Configuration Options

Each server entry supports the following options:

- `name`: Unique identifier for the server
- `command`: The executable to run (e.g., "node", "python", etc.)
- `args`: Array of command-line arguments
- `env`: Environment variables to pass to the server

## Environment Variables

The `VAULT_PATH` environment variable is automatically replaced with your current vault path when the server starts. This allows MCP servers to access files in your vault.

## Bundled MCP Servers

Gaimplan includes five bundled MCP servers:

1. **filesystem-server**: Provides file system operations
2. **search-server**: Enables searching within your vault
3. **git-server**: Offers Git integration capabilities
4. **neo4j-server**: Graph database integration for knowledge graphs
5. **qdrant-server**: Vector database integration for semantic search

These servers are automatically installed in your application support directory when you first run Gaimplan.

## Custom MCP Servers

You can add your own MCP servers by adding entries to the `servers` array. For example:

```json
{
  "name": "my-custom-server",
  "command": "python",
  "args": ["/path/to/my/custom/server.py"],
  "env": {
    "API_KEY": "your-api-key"
  }
}
```

## Troubleshooting

1. **Server not connecting**: Ensure the command and args paths are correct
2. **Permission errors**: Make sure the server executable has proper permissions
3. **Environment variables not working**: Check that variable names match what the server expects

## Note

The MCP settings are stored separately from your vault data to maintain privacy and allow different configurations across vaults. Changes to the settings file require restarting the MCP servers in the application's MCP Settings panel.