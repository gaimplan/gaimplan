# MCP Function Calling Implementation

## Overview

Gaimplan's AI chat now supports automatic execution of MCP (Model Context Protocol) tools through function calling. This enables the AI to perform actions like searching files, reading content, and managing your vault directly from the chat interface.

## Dual Approach Architecture

To support both OpenAI-compatible models and local open-source models like Gemma3, we've implemented two complementary approaches:

### 1. Token-Based Function Calling (OpenAI Format)
- **Used by**: OpenAI GPT models, Claude (when available)
- **How it works**: Uses special `functions` and `function_call` parameters in the API
- **Implementation**: `handleFunctionCallingResponse` in `EnhancedChatPanel.js`

### 2. Prompt-Based Tool Calling (Gemma3 and Others)
- **Used by**: Gemma3, Llama, Mistral, Qwen, and other open-source models
- **How it works**: Tools are described in the system prompt, AI responds with JSON blocks
- **Implementation**: `GemmaPromptToolCalling.js` module

## How It Works

### Prompt-Based Approach (Gemma3)

1. **Tool Description**: When MCP tools are available, they're formatted into the system prompt:
   ```
   You have access to the following tools:
   
   ### filesystem-server
   - **list_files**: List files and directories in a given path
   - **search_files**: Search for files by name pattern recursively
   ...
   ```

2. **Tool Invocation**: The AI responds with a JSON block when it needs to use a tool:
   ```json
   {
       "tool": "search_files",
       "arguments": {
           "pattern": "*",
           "path": "."
       }
   }
   ```

3. **Execution & Response**: The tool is executed and results are added to the conversation

### Token-Based Approach (OpenAI)

1. **Function Definitions**: Tools are sent as function definitions in the API call
2. **Function Call Response**: The model returns a `function_call` or `tool_calls` object
3. **Execution**: Same execution flow as prompt-based approach

## Important Guidelines

### File Listing Operations

When users ask to see "all files" or "what files are in my vault", the AI should:

1. **Use `search_files` with pattern `"*"`** - This recursively lists ALL files
2. **Avoid `list_files` for general listings** - It only shows one directory level
3. **Use `"."` for vault root** - Not "root" or other paths

Example correct usage:
```json
{
    "tool": "search_files",
    "arguments": {
        "pattern": "*",
        "path": "."
    }
}
```

### Tool Selection Guidelines

The system prompt now includes specific guidance:
- "When asked to list 'all files' or 'what files are in vault', use **search_files** with pattern '*' for a recursive listing"
- "The **list_files** tool only shows files in ONE directory - it does NOT recursively list subdirectories"
- "For comprehensive file listings, always prefer **search_files** over **list_files**"

## Visual Feedback

When a tool is executed, users see:
1. **Tool Usage Card**: Shows tool name, server, and status
2. **Spinning Icon**: Indicates tool is running
3. **Success/Error Status**: Green checkmark or red X when complete
4. **Result Display**: Tool output is shown in the chat

## Configuration

### Enabling Function Calling

1. **Configure MCP Servers**: Set up servers in MCP Settings
2. **Select Compatible Model**: 
   - For token-based: Use OpenAI GPT models
   - For prompt-based: Use Gemma3 or other supported models
3. **Tools Auto-Load**: Available tools appear automatically in chat

### Model Detection

The system automatically detects which approach to use:
- Models with "gemma", "llama", "mistral", or "qwen" use prompt-based
- OpenAI endpoints use token-based function calling

## Security Considerations

1. **Tool Permissions**: Each MCP server has configurable permissions
2. **Path Validation**: File operations are restricted to vault directory
3. **No Destructive Operations**: Write/delete operations require explicit user confirmation (planned)

## Troubleshooting

### "Model doesn't support tools" Error
- **Cause**: Using an incompatible model with token-based approach
- **Solution**: The system now automatically falls back to prompt-based approach

### Tool Only Lists Top-Level Files
- **Cause**: AI using `list_files` instead of `search_files`
- **Solution**: Updated prompts guide AI to use `search_files` with pattern "*"

### Tools Not Appearing
- **Check**: MCP servers are running (green status in settings)
- **Check**: Tools are enabled for the server
- **Try**: Restart servers or refresh the chat

## Technical Implementation

### Key Files
- `src/chat/EnhancedChatPanel.js` - Main chat logic and function calling handlers
- `src/chat/GemmaPromptToolCalling.js` - Prompt-based tool calling for Gemma3
- `src/chat/OpenAISDK.js` - OpenAI API integration with function support
- `src/mcp/MCPToolHandler.js` - MCP tool management and UI components
- `src-tauri/src/ai_stream.rs` - Backend support for function calling

### Backend Changes
- Added `send_ai_chat_with_functions` command
- Enhanced `ChatMessage` struct with `function_call` and `tool_calls` fields
- Support for both OpenAI and Ollama function calling formats

## Future Enhancements

1. **Approval Workflow**: User confirmation for destructive operations
2. **Multi-Tool Execution**: Chain multiple tools in one response
3. **Tool Result Context**: Better integration of results into conversation
4. **Custom Tool Creation**: User-defined tools via MCP
5. **Visual Tool Builder**: GUI for creating custom tools