# Gaimplan Beta Tester Guide

Welcome to the Gaimplan beta! This guide will help you install and start using Gaimplan, your new local-first knowledge management app.

## 📋 What You'll Need

- **macOS computer** (Apple Silicon M1/M2/M3 supported)
- **No additional software required** - everything is included!
- **Windows / Lunux** - supported but not tested yet. 

## 🚀 Quick Installation

### Step 1: Download
1. Follow [Deployment Guide](docs/DEPLOYMENT.md)
2. A new window will open showing the Gaimplan app icon


🎉 **You're ready to start using Gaimplan!**

## 🛠️ For Developers (Building from Source)

If you're building Gaimplan from source instead of using the pre-built installer:

### Additional Setup Required

**Install MCP Server Dependencies:**
```bash
# From the gaimplan root directory
cd mcp-servers

# Install dependencies for each server
cd filesystem-server && npm install && cd ..
cd search-server && npm install && cd ..
cd git-server && npm install && cd ..
cd neo4j && npm install && cd ..
cd qdrant-server && npm install && npm run build && cd ..
cd ..  # Return to project root
```

**Why this is needed:**
- MCP servers are Node.js applications that need their dependencies installed
- The qdrant-server is TypeScript and needs to be compiled
- Pre-built installers include these dependencies, but source builds don't

**Then continue with:**
```bash
npm run tauri:dev
```

## 🏠 First Time Setup

### Create Your First Vault
When you first launch Gaimplan, you'll see a welcome screen:

1. **Click "Select Vault Folder"** 
2. **Choose a folder** where you want to store your notes (or create a new one)
3. **Click "Open"** to set up your vault

💡 **Tip**: Choose a folder in your Documents or create a new "Notes" folder - this will contain all your markdown files.

### Your First Note
1. **Press `Cmd+N`** to create a new note
2. **Type a filename** (e.g., "Welcome to Gaimplan")
3. **Click "Create"**
4. **Start writing!** Gaimplan uses Markdown formatting

## ✍️ Writing in Gaimplan

### Live Preview Magic
Gaimplan automatically hides markdown formatting as you type, creating a clean writing experience:

- **Type `**bold text**`** → becomes **bold text** (markers hidden)
- **Type `*italic text*`** → becomes *italic text* (markers hidden)  
- **Type `# Heading`** → becomes a large heading (# hidden)
- **Type `> Quote`** → becomes a styled blockquote (> hidden)

### Smart List Continuation
Gaimplan makes working with lists effortless:

- **Start a list** with `-`, `*`, `+`, or `1.` 
- **Press Enter** at the end of a list item → automatically creates a new bullet
- **Press Enter twice** on an empty bullet → exits list mode
- **Works with numbered lists** → automatically increments numbers
- **Maintains indentation** → nested lists work seamlessly

### AI-First Tags
Gaimplan features an intelligent tag system that enhances AI conversations:

- **Tag Syntax**: Use `#tag` or `#nested/tags` anywhere in your notes
- **Visual Highlighting**: Tags appear with green styling and are clickable
- **AI Context Expansion**: AI automatically detects tags and finds related notes
- **Smart Discovery**: Type "Tell me about machine learning" and AI searches for `#machine-learning`, `#ML`, `#AI` notes
- **Visual Feedback**: Chat shows discovered tags and additional context

### Keyboard Shortcuts

#### File Management
- `Cmd+N` - Create new note
- `Cmd+S` - Save current note (auto-saves every 2 seconds)

#### Formatting
- `Cmd+B` or '**' - **Bold** selected text
- `ii` - *Italic* selected text
- `Cmd+J` - <u>Underline</u> selected text
- `Cmd+H` or '==' - ==Highlight== selected text
- `Cmd+Shift+X` - ~~Strikethrough~~ selected text
- `Cmd+K` - Insert link
- `Cmd+Shift+H` - Generate highlights summary

#### Tags
- `#tag` - Create a simple tag
- `#nested/tags` - Create hierarchical tags
- Click any tag to search for related notes

#### Tabs & Navigation
- `Cmd+Shift+T` - New tab
- `Cmd+W` - Close current tab

#### View Options
- `Cmd+Option+Z` - Toggle zen mode (distraction-free writing)
- `ESC` - Exit zen mode
- `Cmd+Shift+C` - Toggle AI chat panel

## 🖼️ Working with Images

### Paste Images Directly
1. **Copy any image** (from web, screenshot, etc.)
2. **Paste with `Cmd+V`** directly into your note
3. **Images are automatically saved** to a `files/` folder in your vault
   - Location customizable under 'Editor Settings' menu. 
4. **Clean syntax**: Images show as `![[filename.png]]` in editing mode

### View Images
- **Click any image file** in the sidebar to view it in a tab
- **Images display full-size** with the filename as a heading

## 📄 PDF Viewer & Highlighting

### Opening PDFs
- **Click any PDF file** in the sidebar to open it in a tab
- **PDFs render with full text selection** support
- **Zoom controls** in the toolbar (-, +, fit to page)
- **Navigate pages** with Previous/Next buttons or keyboard shortcuts

### PDF Highlighting
Gaimplan includes a powerful PDF highlighting system:

1. **Select text** in any PDF using your mouse
2. **Press `Cmd+Shift+H`** or click the highlight button to highlight selection
3. **Highlights are persistent** - they're saved and reload when you reopen the PDF
4. **Multiple highlight colors** available (yellow by default)

### Extract Highlights to Notes
Convert all your PDF highlights into a markdown note:

1. **Open a PDF** with existing highlights
2. **Press `Cmd+Shift+E`** or click "Extract Highlights" button
3. **A new markdown note is created** with all highlighted text
4. **Note includes page numbers** and links back to the PDF

### PDF Keyboard Shortcuts
- `Cmd+Shift+H` - Highlight selected text
- `Cmd+Shift+E` - Extract all highlights to markdown
- `Cmd+Z` - Undo last highlight
- `Cmd+Shift+Z` - Redo highlight
- `Delete` - Remove selected highlight

💡 **Pro Tip**: If you have text selected when extracting highlights, it will be highlighted first before extraction!

## 🗂️ Organizing Your Notes

### File Structure
Your vault folder contains:
- **Markdown files** (.md) - your actual notes
- **files/ folder** - pasted images and attachments
- **Subfolders** - organize notes however you like

### Sidebar Navigation
- **Click any file** to open it
- **Folders are collapsible** - click the arrow to expand/collapse
- **Recent files** appear at the top level for quick access

### Tabs System
- **Multiple notes open** - up to 5 tabs per pane
- **Split view** - `Cmd+\` for side-by-side editing
- **Drag tabs** to reorder them
- **• indicator** shows unsaved changes

## 🔗 Neo4j Knowledge Graph (Beta)

### Automatic Knowledge Graph Sync
Gaimplan automatically syncs your notes to a Neo4j graph database, creating a powerful knowledge graph:

- **Auto-sync on Save**: Every time you save a note (auto or manual), it syncs to Neo4j
- **Smart Batch Processing**: Optimized performance with intelligent file size-based delays
- **Visual Status Indicator**: Real-time sync status shown in the status bar (🟢 enabled, ⚫ disabled)
- **Background Processing**: Sync happens in the background without interrupting your writing
- **Semantic Relationships**: Automatically discovers connections between your notes
- **Graph Visualization**: View your knowledge as an interconnected graph in Neo4j Browser

### Graph Sync Status
The status bar shows your current graph sync status:

- **🟢 Graph Sync**: Sync is enabled and working
- **⚫ Graph Sync**: Sync is disabled (click to enable)
- **Pending count**: Shows number of notes waiting to sync
- **Error indicator**: Shows if there are sync failures

### Automatic Setup
Neo4j integration starts automatically when you open a vault:

1. **Docker containers start**: Neo4j and Qdrant containers launch in background
2. **Connection established**: Graph sync connects and enables automatically
3. **No manual setup needed**: Everything happens transparently

### Accessing Neo4j Browser
To explore your knowledge graph:

1. **Open browser**: Navigate to http://localhost:7474
2. **Login credentials**: 
   - Username: `neo4j`
   - Password: Check your `.env` file or `NEO4J_PASSWORD` environment variable 
3. **View your graph**: See all notes as nodes with semantic relationships

### Performance Features
- **Smart debouncing**: 2s/5s/10s delays based on file size
- **Batch processing**: Updates processed in batches of 10 or every 30 seconds
- **Queue management**: Automatic deduplication of updates
- **Minimal logging**: Clean terminal output showing only sync summaries

### Testing Graph Sync
To verify graph sync is working:

1. **Check status bar**: Look for 🟢 Graph Sync indicator
2. **Open browser console** (F12)
3. **Run test command**: `window.testGraphSync()`
4. **Check status**: `window.checkGraphStatus()`
5. **View in Neo4j**: See your notes as nodes in the graph
6. **Clear graph data**: `window.clearGraphData()` to reset everything

### Graph Data Management
If you need to start fresh with your graph data:

**Via Console (Recommended):**
```javascript
window.clearGraphData() // Clears both Neo4j and Qdrant data
```

**Via Neo4j Browser (Direct):**
1. Open http://localhost:7474
2. Run: `MATCH (n) DETACH DELETE n`
3. Run: `DROP CONSTRAINT unique_node_id IF EXISTS`

💡 **Note**: Neo4j integration requires Docker Desktop. If Docker is not installed, Gaimplan works normally without graph sync.

## 💡 Highlights Summary

### Extract Important Points
Gaimplan can automatically extract all ==highlighted text== from your note:

1. **Highlight important text** using `==text==` syntax or `Cmd+H`
2. **Press `Cmd+Shift+H`** or click the star button next to the + tab button
3. **A summary section** is created at the bottom with all highlights
4. **Perfect for**: study notes, meeting minutes, research papers

## 🤖 AI Chat Assistant

### Getting Started with AI
1. **Press `Cmd+Shift+C`** to open the chat panel
2. **Click the gear icon** to configure your AI provider
3. **Choose a provider** and enter credentials:
   - **OpenAI**: Enter your OpenAI API key
   - **Google Gemini**: Get API key from [Google AI Studio](https://aistudio.google.com/apikey)
   - **Ollama**: No API key needed (runs locally)
   - **LM Studio**: No API key needed (runs locally)
4. **Start chatting!** Your current note is automatically included as context

### AI-First Tags Integration
Gaimplan's revolutionary tag system transforms how AI interacts with your knowledge:

- **Automatic Tag Detection**: AI detects tags in your messages and current context
- **Context Expansion**: AI automatically searches for related tagged notes
- **Smart Inference**: AI infers relevant tags from keywords ("machine learning" → searches for `#ML`, `#AI`)
- **Visual Feedback**: Chat shows discovered tags like "🏷️ Related tags: #project, #research"
- **Connected Conversations**: AI provides more contextually aware responses using tag relationships

**Example Workflow:**
1. Working on a note with `#project/alpha` tag
2. Ask AI: "What's the status of this project?"
3. AI automatically finds notes with `#project/alpha`, `#meetings`, `#deliverables`
4. Response includes context from all related tagged notes

**Try These Commands:**
- "Show me everything about #project/alpha"
- "What meetings did I have about this?"
- "Find my research on machine learning"
- "What's connected to this project?"

💡 **New: Multi-Provider Settings** - Each AI provider now saves its own settings! Switch between providers without losing your configuration. The active provider shows with a green checkmark (✓).

### AI Features
- **Context-aware**: AI sees your current note automatically
- **Add more context**: Click "Add Context" button to include other notes
- **Instant feedback**: "Thinking..." indicator appears immediately when you send a message
- **Real-time responses**: Streaming responses show content as it's generated
- **Copy responses**: Click the copy button on any AI message
- **Export chats**: Click the ⬇️ button to save conversations to "Chat History" folder
- **New chat**: Click the + button to start fresh (clears current conversation)
- **Tool integration**: AI can automatically search files, analyze content, and perform actions

💡 **Important**: Chat history persists between sessions but is cleared when you click "New Chat". Export important conversations to save them permanently!

### AI Provider Setup

#### OpenAI
1. **Get API Key**: Visit [platform.openai.com](https://platform.openai.com/api-keys)
2. **Models**: gpt-4, gpt-3.5-turbo, gpt-4-turbo-preview
3. **Cost**: Pay-per-use (see OpenAI pricing)

#### Google Gemini (NEW!)
1. **Get API Key**: Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. **Models**: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro
3. **Cost**: Free tier available, then pay-per-use
4. **Features**: 
   - Full MCP tools support with function calling
   - Real-time streaming responses
   - Context-aware conversations
   - Advanced reasoning capabilities
5. **Technical Notes**: 
   - Uses OpenAI-compatible endpoint for seamless integration
   - Supports the newer 'tools' format for function calling
   - Optimized for tool execution and response generation

#### Ollama (Local)
1. **Install**: Download from [ollama.ai](https://ollama.ai)
2. **Models**: llama2, mistral, codellama, gemma
3. **Cost**: Free (runs on your computer)
4. **Endpoint**: http://localhost:11434/v1

#### LM Studio (Local)
1. **Install**: Download from [lmstudio.ai](https://lmstudio.ai)
2. **Models**: Any GGUF model from HuggingFace
3. **Cost**: Free (runs on your computer)
4. **Endpoint**: http://localhost:1234/v1

### MCP Tools Integration
Gaimplan's AI assistant can now use tools to help you manage your vault:

- **File Operations**: Create, read, update, and organize your notes
- **Search & Analysis**: Find content, extract highlights, analyze links
- **Tag-Based Search**: AI uses `search_by_tag` tool to find related notes
- **Git Integration**: Commit changes, view history (if your vault uses Git)

**How it works:**
1. **Tools appear automatically** when MCP servers are connected
2. **See available tools** in the chat header (e.g., "15 tools (3 servers)")
3. **Just ask naturally** - the AI will use appropriate tools
4. **Configure servers** via AI Settings → MCP Settings

**Example requests:**
- "Find all notes mentioning productivity"
- "Show me notes tagged with #project/alpha"
- "Create a new note called 'Project Ideas' in the projects folder"
- "Show me all my highlighted text from this week"
- "What notes link to this one?"
- "Find everything about machine learning" (AI searches for `#machine-learning`, `#ML`, `#AI`)

## 📤 Export Your Work

### Export Formats
Gaimplan can export your notes to multiple formats:

- **PDF**: High-quality PDF with images
- **HTML**: Clean HTML with embedded images  
- **Word**: Editable .doc format

### Export Process
1. **Open the note** you want to export
2. **Press the keyboard shortcut** or use the editor menu (☰)
3. **Choose save location** and filename
4. **Click Save** - your export is ready!

## 🎯 Tips for Beta Testing

### What to Try
- **Create different types of notes**: meeting notes, project plans, daily journals
- **Test formatting**: headings, lists, quotes, code blocks, tables
- **Test list features**: Try auto-continuation with -, *, +, and numbered lists
- **Try images**: paste screenshots, photos, diagrams
- **Use split view**: compare notes side-by-side
- **Export functionality**: PDF for sharing, Word for collaboration
- **Highlights summary**: Use ==highlights== and generate summaries
- **AI chat**: Ask questions about your notes, get writing help
- **PDF features**: Open PDFs, highlight important text, extract highlights to notes
- **Research workflow**: Highlight key passages in PDFs and convert to study notes
- **AI-First Tags**: Create notes with `#project/alpha`, `#meetings`, `#research` tags
- **Tag-Based AI Chat**: Ask "What do I know about project alpha?" and watch AI find related notes
- **Smart Context**: Notice how AI automatically includes related tagged notes in responses
- **Tag Discovery**: Try asking about topics and see AI infer relevant tags

### What to Report
Please let us know about:
- **Crashes or freezes** - when and what you were doing
- **Formatting issues** - text that doesn't display correctly
- **Save problems** - notes not saving properly
- **Performance issues** - slow typing, lag, etc.
- **Feature requests** - what would make Gaimplan better for you?

### Performance Notes
- **Auto-save**: Notes save automatically every 2 seconds
- **Memory efficient**: Gaimplan uses minimal system resources with proper cleanup
- **Fast startup**: Should launch in under 2 seconds
- **Stability**: Fixed critical memory leaks and improved crash prevention
- **Performance monitoring**: Debug tools available for troubleshooting (`window.perfReport()` in browser console)

## 🔧 Troubleshooting

### App Won't Open
**Issue**: "Cannot open because Apple cannot check it"
**Solution**: Right-click Gaimplan → Open → Open (only needed once)

### Files Not Saving
**Issue**: Changes seem lost
**Check**: Look for • indicator in tab - means unsaved changes
**Solution**: Press `Cmd+S` to force save

### Images Not Displaying
**Issue**: Pasted images show as broken links
**Check**: Make sure you're pasting into a saved note (not "Untitled")
**Solution**: Save the note first (`Cmd+S`), then paste images

### Slow Performance
**Issue**: Typing feels laggy
**Cause**: Very large notes (10,000+ words) may slow down
**Solution**: Break large notes into smaller files

### Settings Not Saving
**Issue**: API keys or preferences reset after restart
**Check**: Ensure Gaimplan has write permissions to settings folder
**Solution**: Check folder permissions (see Data Storage section)

### Can't Find Vault on New Computer
**Issue**: Gaimplan shows welcome screen instead of your notes
**Cause**: Vault path differs between computers
**Solution**: Click "Select Vault Folder" and choose your notes folder

### AI Chat Issues
**Issue**: "Thinking..." appears but no response comes back
**Cause**: API configuration or network issues
**Solutions**: 
- Check your API key is valid and has credit/quota
- Verify your internet connection
- Try a different AI provider (OpenAI, Gemini, Ollama)
- Check the browser console for error messages

**Issue**: MCP tools not working with AI
**Cause**: Server connection or configuration issues
**Solutions**:
- Go to AI Settings → MCP Settings to check server status
- Look for "connected" status indicators (green dots)
- Restart disconnected servers
- Check that your AI provider supports function calling

## 📞 Getting Help

### During Beta Period
- **Email**: [info@gaimplan.com]
- **What to include**: 
  - What you were doing when the issue occurred
  - Screenshot if visual problem
  - Operating system version
  - Steps to reproduce the problem

### Quick Debug Info
To help us debug issues:
1. **Open Activity Monitor**
2. **Find "gaimplan" process**
3. **Note memory usage and CPU %**
4. **Include this info in bug reports**



---

## Welcome to Gaimplan! 🎉

Thank you for being a beta tester. Your feedback will help make Gaimplan the best knowledge management app possible.

**Happy note-taking!** ✍️

---

## 🔍 Semantic Search with Qdrant

Gaimplan includes powerful semantic search capabilities powered by Qdrant vector database, enabling you to find conceptually related notes without exact keyword matches.

### Getting Started with Semantic Search

1. **Enable Qdrant MCP Server**:
   - Open MCP Settings (from AI Chat panel)
   - Find "Qdrant Semantic Memory" server
   - Toggle it on (it will connect automatically)

2. **Sync Your Notes**:
   - Open global search (Cmd+F)
   - Click the "Sync" button (eye icon)
   - Wait for sync to complete - you'll see progress indicators:
     - ✓ New embeddings created
     - ⏭️ Existing embeddings skipped
     - ✗ Failed embeddings (if any)

3. **Switch to Semantic Search**:
   - In global search, click "Semantic" mode
   - Search for concepts, not just keywords
   - Find related notes based on meaning

### Key Features

- **Local Embeddings**: Uses all-MiniLM-L6-v2 model locally (384 dimensions, no API required)
- **Vault Isolation**: Each vault has its own collections (e.g., `gaimplan-dev_pattern_embeddings`)
- **Smart Sync**: Only creates embeddings for new notes, skips existing ones
- **Privacy First**: All processing happens locally on your machine
- **MCP Integration**: Both Neo4j and Qdrant servers support local embedding generation
- **Duplicate Prevention**: Intelligent checking prevents redundant embeddings

### Troubleshooting

- **"Invalid vault path" error**: Reload the app and re-enable the server
- **Collections using wrong name**: Click the 🔄 button next to Qdrant server to sync vault name
- **Duplicate embeddings**: The system now checks before creating, preventing duplicates
- **Graph sync stuck**: Try `window.clearGraphData()` to reset and start fresh
- **Neo4j duplicate relationships**: Fixed in latest update - relationships now use MERGE instead of CREATE

---

*This guide covers Gaimplan v0.1.0 beta with latest updates through 2025-07-20. Features and shortcuts may change in future versions.*