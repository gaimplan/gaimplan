# AI Setup Guide

This guide covers how to configure AI providers in Gaimplan for enhanced knowledge discovery and chat capabilities.

## Supported AI Providers

Gaimplan supports multiple AI providers with different capabilities:

1. **OpenAI** (GPT-4.1, GPT-4o)
2. **Google Gemini** (Gemini Pro, Gemini Flash)
3. **Ollama** (Local models: Llama, Gemma, Mistral, etc.)
4. **LM Studio** (Local models with OpenAI-compatible API)
5. **Custom OpenAI-Compatible** (Any provider with OpenAI API format)

## Configuration Steps

### 1. Access AI Settings

1. Open the Chat panel (Cmd+Shift+C or click Chat in sidebar)
2. Click the settings icon (⚙️) in the chat panel
3. Select your preferred AI provider from the dropdown

### 2. Provider-Specific Setup

#### OpenAI

1. Get your API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Enter the API key in the settings
3. Select your preferred model (GPT-4 recommended)
4. Default endpoint: `https://api.openai.com/v1/chat/completions`

#### Google Gemini

1. Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Enter the API key in the settings
3. Select model: Gemini Pro (balanced) or Gemini Flash (faster)
4. Default endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`

#### Ollama (Local)

1. Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull a model: `ollama pull gemma3` (or gemma3, mistral, etc.)
3. No API key required
4. Default endpoint: `http://localhost:11434/api/generate`
5. Enter your model name exactly as shown in `ollama list`

#### LM Studio

1. Download and install [LM Studio](https://lmstudio.ai/)
2. Load a model in LM Studio
3. Start the local server (usually on port 1234)
4. No API key required
5. Default endpoint: `http://localhost:1234/v1/chat/completions`

#### Custom Provider

1. Enter your provider's API endpoint
2. Add API key if required
3. Ensure the provider is OpenAI-compatible

## Advanced Features

### Context-Aware Chat

- **Active Note Context**: The AI automatically includes your currently open note
- **Add Context**: Click "Add Context" to include additional notes in the conversation
- **Tag Expansion**: Use #tags in your messages - AI will find and include related notes

### MCP Tool Integration

When MCP servers are configured, the AI can:
- Search through your vault
- Read specific files
- Analyze code and documents
- Perform file operations

See [MCP_SETTINGS_EXAMPLE.md](./MCP_SETTINGS_EXAMPLE.md) for MCP setup.

### Model-Specific Notes

#### Gemma/Llama Models
These models often ignore system prompts. Gaimplan automatically adjusts by including context directly in user messages for better results.

#### Streaming Support
- **Supported**: OpenAI, Custom providers with SSE
- **Not Supported**: Ollama (uses native format), some local models

## Troubleshooting

### "Please provide the note" Responses
- **Cause**: Model not receiving context properly
- **Fix**: Ensure you have a note open or use "Add Context"

### Connection Errors
1. Check your API key is correct
2. Verify endpoint URL (no trailing slashes)
3. For local models, ensure the server is running
4. Check firewall/proxy settings

### Slow Responses
- Local models (Ollama/LM Studio) depend on your hardware
- Try smaller models (Gemma 2B, Llama 3B) for faster responses
- Google Gemini Flash is optimized for speed

### API Limits
- OpenAI: Check your usage at [platform.openai.com](https://platform.openai.com)
- Google Gemini: Free tier has generous limits
- Local models: No limits, but hardware-constrained

## Security Notes

- API keys are stored securely using Tauri's Stronghold encryption
- Keys are never sent to our servers (Gaimplan is 100% local)
- For maximum privacy, use Ollama or LM Studio with local models

## Cost Considerations

- **Free**: Ollama, LM Studio (local models)
- **Free Tier**: Google Gemini (generous limits)
- **Paid**: OpenAI (pay per token)
- **Custom**: Depends on provider

## Tips for Best Results

1. **Be Specific**: Include relevant context in your questions
2. **Use Tags**: #project-name or #topic helps AI find related notes
3. **Model Selection**: 
   - Gemini Pro: Good balance of speed and quality
   - Local models: Privacy-first, no internet required
4. **Export Chats**: Use the export button to save important conversations to your vault