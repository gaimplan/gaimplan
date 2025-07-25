// Gemma3 Prompt-based Tool Calling for MCP
// Uses structured prompting instead of OpenAI's function_call format

export class GemmaPromptToolCalling {
    constructor() {
        this.toolPromptTemplate = `You have access to the following tools:

{tools}

To use a tool, respond with a JSON block in this exact format:
\`\`\`json
{
    "tool": "tool_name",
    "arguments": {
        "param1": "value1",
        "param2": "value2"
    }
}
\`\`\`

After receiving the tool result, you can continue the conversation naturally.
If you don't need to use a tool, just respond normally without any JSON block.

Important guidelines:
- When asked to list "all files" or "what files are in vault", use search_files with pattern "*" to get a recursive listing
- list_files only shows files in ONE directory - it does NOT recursively list subdirectories
- For comprehensive file listings, always prefer search_files over list_files
- For file paths: use "." for the vault root directory, not "root"
- Always explain what you're doing when using tools
- Use the exact tool names and parameter names as specified`;
    }

    /**
     * Format tools for Gemma3 prompt-based approach
     * @param {Array} tools - MCP tools from MCPToolHandler
     * @returns {string} Formatted tool descriptions
     */
    formatToolsForPrompt(tools) {
        if (!tools || tools.length === 0) {
            return '';
        }

        const toolDescriptions = tools.map(tool => {
            const params = tool.parameters || {};
            const properties = params.properties || {};
            const required = params.required || [];
            
            let paramDesc = Object.entries(properties).map(([name, schema]) => {
                const isRequired = required.includes(name);
                const type = schema.type || 'string';
                const desc = schema.description || '';
                return `    - ${name} (${type}${isRequired ? ', required' : ''}): ${desc}`;
            }).join('\n');

            return `- **${tool.name}**: ${tool.description}
  Parameters:
${paramDesc || '    None'}`;
        }).join('\n\n');

        return this.toolPromptTemplate.replace('{tools}', toolDescriptions);
    }

    /**
     * Extract tool call from Gemma3 response
     * @param {string} response - The model's response
     * @returns {Object|null} Tool call object or null if no tool call found
     */
    extractToolCall(response) {
        // Look for JSON code block
        const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
        
        if (!jsonMatch) {
            return null;
        }

        try {
            const toolCall = JSON.parse(jsonMatch[1]);
            
            // Validate structure
            if (!toolCall.tool || !toolCall.arguments) {
                console.warn('Invalid tool call structure:', toolCall);
                return null;
            }

            // Convert to standard format
            return {
                name: toolCall.tool,
                arguments: JSON.stringify(toolCall.arguments)
            };
        } catch (error) {
            console.error('Failed to parse tool call JSON:', error);
            return null;
        }
    }

    /**
     * Format tool result for conversation
     * @param {Object} result - Tool execution result
     * @returns {string} Formatted result
     */
    formatToolResult(result) {
        if (result.success) {
            return `Tool result:\n${result.result}`;
        } else {
            return `Tool error: ${result.error}`;
        }
    }

    /**
     * Check if a model supports prompt-based tool calling
     * @param {string} model - Model name
     * @returns {boolean} True if model supports prompt-based tools
     */
    supportsPromptTools(model) {
        return model.includes('gemma') || 
               model.includes('llama') || 
               model.includes('mistral') ||
               model.includes('qwen');
    }
}

// Export singleton instance
export const gemmaPromptToolCalling = new GemmaPromptToolCalling();