# MCP (Model Context Protocol) Integration

Gaimplan includes a powerful MCP integration that allows AI assistants to use tools to interact with your vault and perform various operations. This enables a more intelligent and capable AI experience where the assistant can actually help you manage and analyze your knowledge base.

## Overview

The Model Context Protocol (MCP) is an open protocol that standardizes how AI applications can use tools. gaimplan's implementation includes:

- **Full MCP v1.0.0 Support**: Complete protocol implementation with tools, resources, and prompts
- **Bundled Servers**: Pre-configured servers for common operations
- **Visual Integration**: See available tools directly in the AI chat interface
- **Secure Execution**: Sandboxed tool execution with configurable permissions
- **Persistent Configuration**: Server settings are saved and restored across sessions
- **Real-time Streaming**: AI responses stream in real-time with visual feedback
- **Model Compatibility**: Automatic context formatting for Gemma/Llama models

## Bundled MCP Servers

Gaimplan comes with three powerful MCP servers pre-installed:

### 1. Filesystem Tools Server (`gaimplan-filesystem`)
**Enabled by default**

Provides comprehensive file operations within your vault:
- **list_files**: List files and directories with metadata
- **read_file**: Read the contents of any file
- **write_file**: Create or update files
- **create_directory**: Create new folders
- **delete_file**: Delete files or empty directories
- **move_file**: Move or rename files
- **search_files**: Find files by name pattern with wildcards

### 2. Search & Analysis Server (`gaimplan-search`)
**Enabled by default**

Advanced search and analysis capabilities:
- **search_content**: Full-text search within markdown files
- **search_by_tag**: Find files containing specific #tags
- **find_links**: Discover all links (wiki-style [[]] and markdown []()])
- **find_orphaned_notes**: Identify notes with no incoming links
- **extract_highlights**: Extract all ==highlighted text== from your vault

### 3. Git Version Control Server (`gaimplan-git`)
**Disabled by default** (enable if your vault uses Git)

Complete Git workflow support:
- **git_status**: Check current repository status
- **git_add**: Stage files for commit
- **git_commit**: Create commits with messages
- **git_diff**: View changes (staged or unstaged)
- **git_log**: View commit history
- **git_branch**: Manage branches
- **git_push/pull**: Sync with remote repositories
- **git_stash**: Temporarily save uncommitted changes

## Using MCP Tools

### In AI Chat

When MCP servers are connected, you'll see a tools indicator in the chat header showing:
- Number of available tools
- Number of connected servers
- Hover to see breakdown by server

The AI assistant automatically knows about available tools and can use them to help you. For example:

```
You: "Find all notes that mention 'productivity'"
AI: I'll search for notes containing "productivity"...
[Uses search_content tool]
```

```
You: "Create a new note called 'Meeting Notes' in the meetings folder"
AI: I'll create that note for you...
[Uses create_directory and write_file tools]
```

### Managing MCP Servers

1. **Open MCP Settings**: 
   - Click the gear icon in AI Chat settings
   - Click "MCP Settings" button
   - Or use keyboard shortcut: Cmd+Shift+M

2. **Server Management**:
   - Enable/disable servers with the toggle
   - Add custom servers with the "Add Server" button
   - Edit server configurations
   - Test connections before enabling

3. **Permissions**:
   Each server has configurable permissions:
   - **Read**: Can read files and data
   - **Write**: Can create/modify files
   - **Delete**: Can delete files
   - **External Access**: Can make network requests

## Adding Custom MCP Servers

You can add your own MCP servers:

1. Click "Add Server" in MCP Settings
2. Configure the server:
   - **Name**: Display name for the server
   - **Transport**: stdio (local) or HTTP (remote)
   - **Command**: For stdio, the command to run
   - **Environment**: Variables passed to the server
3. Set capabilities and permissions
4. Test the connection
5. Save and enable

## Technical Details

### Architecture

```
gaimplan Frontend
     ↓
MCP Manager (TypeScript)
     ↓
Tauri Bridge
     ↓
MCP Backend (Rust)
     ↓
Server Processes (Node.js)
```

### Server Communication

- **Transport**: stdio (standard input/output) or HTTP
- **Protocol**: JSON-RPC 2.0 over transport
- **Lifecycle**: Initialize → Tool Discovery → Tool Execution → Cleanup

### Security

- All servers run with restricted permissions
- Path validation prevents access outside vault
- Sensitive operations require explicit permissions
- No external network access by default

## Troubleshooting

### Server Won't Connect
1. Check the server logs in MCP Settings
2. Verify the command path is correct
3. Ensure Node.js is installed for bundled servers
4. Test connection with the test button

### Tools Not Showing
1. Ensure MCP is enabled in settings
2. Check that servers are connected (green dot)
3. Refresh the chat interface
4. Check browser console for errors

### Performance Issues
- Disable unused servers
- Limit number of concurrent operations
- Check server resource usage

## Function Calling ✅

The AI can now automatically execute MCP tools! See [MCP Function Calling Guide](./MCP_FUNCTION_CALLING.md) for details.

### Key Features:
- **Automatic Tool Execution**: AI detects when to use tools based on your questions
- **Dual Approach**: Supports both OpenAI models and local models like Gemma3
- **Visual Feedback**: See tool execution status in real-time
- **Smart File Operations**: AI knows to use `search_files` for recursive listings

## Future Enhancements

- **Approval Workflow**: User confirmation for destructive operations
- **More Bundled Servers**: Web search, calendar integration, etc.
- **Server Marketplace**: Share and discover community servers
- **Multi-Tool Chains**: Execute multiple tools in sequence