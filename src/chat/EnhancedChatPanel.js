// EnhancedChatPanel.js - Enhanced chat panel with multi-provider AI support
console.log('💬 Enhanced ChatPanel loading...');

import { ChatInterface } from './ChatInterface.js';
import { ClaudeAuth } from './ClaudeAuth.js';
import { ContextManager } from './ContextManager.js';
import { ChatPersistence } from './ChatPersistence.js';
import { OpenAISDK } from './OpenAISDK.js';
import { AISettingsPanel } from '../settings/AISettingsPanel.js';

import { mcpManager } from '../mcp/MCPManager.js';
import { mcpToolHandler } from '../mcp/MCPToolHandler.js';
import { gemmaPromptToolCalling } from './GemmaPromptToolCalling.js';
import { tagContextExpander } from './TagContextExpander.js';

// Import Tauri API
import { invoke } from '@tauri-apps/api/core';

export class EnhancedChatPanel {
    constructor() {
        console.log('🔧 Initializing Enhanced ChatPanel');
        this.container = null;
        this.isAuthenticated = false;
        // Initialize visibility from saved state to prevent state mismatch
        this.isVisible = localStorage.getItem('gaimplan-chat-visible') === 'true';
        this.width = 350;
        this.minWidth = 280;
        this.maxWidth = 600;
        
        // AI Provider Management
        this.currentProvider = 'openai'; // Always use OpenAI
        this.providers = {
            openai: {
                name: 'OpenAI/Custom',
                sdk: null,
                configured: false,
                status: 'unknown'
            }
        };
        
        // Components
        this.auth = null;
        this.interface = null;
        this.contextManager = null;
        this.persistence = null;
        this.settingsPanel = null;
        this.showingSettings = false;
        
        // Resize state
        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
    }
    
    async mount(parentElement) {
        console.log('📌 Mounting Enhanced ChatPanel');
        
        // Create main container (fills the right sidebar)
        this.container = document.createElement('div');
        this.container.className = 'chat-panel enhanced right-sidebar-panel';
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        
        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'chat-content-wrapper';
        
        // Initialize components
        this.auth = new ClaudeAuth();
        this.interface = new ChatInterface();
        this.contextManager = new ContextManager();
        this.persistence = new ChatPersistence();
        this.settingsPanel = new AISettingsPanel();
        
        // Initialize SDK
        this.providers.openai.sdk = new OpenAISDK();
        
        await this.initializeProviders();
        
        // Set up authentication callback
        this.auth.onAuthStateChanged = (authenticated) => {
            console.log('🔐 Auth state changed:', authenticated);
            this.isAuthenticated = authenticated;
            this.updateUI();
        };
        
        // Set up message send callback
        this.interface.onSendMessage = async (message) => {
            console.log('📤 Sending message via', this.currentProvider);
            await this.handleSendMessage(message);
        };
        
        // Set up context change callback
        this.contextManager.onContextChanged = (context) => {
            console.log('📎 Context changed:', context);
            this.interface.updateContext(context);
        };
        
        // Build initial UI
        this.buildUI(contentWrapper);
        
        // Assemble container (no resize handle for right sidebar)
        this.container.appendChild(contentWrapper);
        parentElement.appendChild(this.container);
        
        // Load saved settings
        this.loadSavedProvider();
        
        // Check authentication status
        this.auth.checkAuthStatus();
        
        // Load chat history
        setTimeout(() => {
            this.loadChatHistory();
        }, 100);
        
        console.log('✅ Enhanced ChatPanel mounted successfully');
    }
    
    async initializeProviders() {
        console.log('🚀 Initializing AI providers...');
        
        try {
            // Initialize OpenAI SDK
            const initialized = await this.providers.openai.sdk.initialize();
            this.providers.openai.configured = initialized;
            this.providers.openai.status = initialized ? 'ready' : 'not-configured';
        } catch (error) {
            console.warn('OpenAI SDK initialization failed:', error);
            this.providers.openai.configured = false;
            this.providers.openai.status = 'error';
        }
        
        // Always use OpenAI/Custom
        this.currentProvider = 'openai';
        
        console.log('Providers initialized:', {
            openai: this.providers.openai.status,
            current: this.currentProvider
        });
    }
    
    buildUI(wrapper) {
        wrapper.innerHTML = '';
        
        if (this.showingSettings) {
            this.buildSettingsUI(wrapper);
        } else {
            console.log('💬 Showing enhanced chat interface');
            this.buildChatUI(wrapper);
        }
    }
    
    buildChatUI(wrapper) {
        // Add header
        const header = this.createEnhancedHeader();
        wrapper.appendChild(header);
        
        // Check if current provider is configured
        const provider = this.providers[this.currentProvider];
        
        if (!provider.configured) {
            // Show configuration prompt
            const configPrompt = this.createConfigPrompt();
            wrapper.appendChild(configPrompt);
        } else {
            // Add chat interface
            const chatContainer = document.createElement('div');
            chatContainer.className = 'chat-interface-container';
            this.interface.mount(chatContainer);
            wrapper.appendChild(chatContainer);
            
            // Add context manager
            const contextContainer = document.createElement('div');
            contextContainer.className = 'chat-context-container';
            this.contextManager.mount(contextContainer);
            wrapper.appendChild(contextContainer);
        }
    }
    
    buildSettingsUI(wrapper) {
        const settingsContainer = document.createElement('div');
        settingsContainer.className = 'settings-container';
        
        // Add back button
        const backButton = document.createElement('button');
        backButton.className = 'back-button';
        backButton.innerHTML = '← Back to Chat';
        backButton.onclick = () => this.hideSettings();
        
        settingsContainer.appendChild(backButton);
        
        // Create scrollable content area
        const scrollableContent = document.createElement('div');
        scrollableContent.className = 'settings-scrollable-content';
        scrollableContent.style.flex = '1';
        scrollableContent.style.overflow = 'hidden';
        
        // Mount settings panel
        this.settingsPanel.mount(scrollableContent, {
            onSave: async (settings) => {
                console.log('Settings saved, refreshing providers...');
                await this.refreshProviders();
                // Auto-switch to OpenAI if it becomes configured
                if (this.providers.openai.configured) {
                    this.currentProvider = 'openai';
                }
                this.hideSettings();
            }
        });
        
        settingsContainer.appendChild(scrollableContent);
        wrapper.appendChild(settingsContainer);
    }
    
    createEnhancedHeader() {
        const header = document.createElement('div');
        header.className = 'chat-header simple';
        
        // Left side - title and model selector
        const leftSection = document.createElement('div');
        leftSection.className = 'chat-header-left';
        
        const title = document.createElement('h3');
        title.className = 'chat-title';
        title.textContent = 'Chat';
        
        // Status indicator (moved to left side, after title)
        const statusDot = document.createElement('span');
        statusDot.className = 'status-dot';
        const isConnected = this.providers[this.currentProvider].configured;
        statusDot.classList.add(isConnected ? 'connected' : 'disconnected');
        statusDot.title = isConnected ? 'AI online' : 'AI offline';
        
        leftSection.appendChild(title);
        leftSection.appendChild(statusDot);
        
        // MCP Tools indicator removed for cleaner UI
        
        // Minimal actions
        const actions = document.createElement('div');
        actions.className = 'chat-actions';
        
        // Export/Download button
        const exportBtn = document.createElement('button');
        exportBtn.className = 'chat-action-btn minimal';
        exportBtn.title = 'Export chat';
        exportBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
        `;
        exportBtn.onclick = () => this.exportChat();
        
        // New Chat button (more prominent - 20% larger)
        const newChatBtn = document.createElement('button');
        newChatBtn.className = 'chat-action-btn minimal new-chat-btn';
        newChatBtn.title = 'New Chat';
        newChatBtn.innerHTML = `
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
        `;
        newChatBtn.onclick = () => this.clearChat();
        
        // Settings button (gear icon)
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'chat-action-btn minimal';
        settingsBtn.title = 'Settings';
        settingsBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
            </svg>
        `;
        settingsBtn.onclick = () => this.showSettings();
        
        // MCP Settings button
        const mcpSettingsBtn = document.createElement('button');
        mcpSettingsBtn.className = 'chat-action-btn minimal';
        mcpSettingsBtn.title = 'MCP Settings';
        mcpSettingsBtn.innerHTML = `
            <span style="
                font-weight: bold; 
                font-size: 12px; 
                line-height: 1;
                border: 1px solid currentColor;
                border-radius: 3px;
                padding: 2px 4px;
                display: inline-block;
            ">M</span>
        `;
        mcpSettingsBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.mcpSettings) {
                window.mcpSettings.show();
            }
        };
        

        actions.appendChild(newChatBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(mcpSettingsBtn);
        actions.appendChild(settingsBtn);
        
        header.appendChild(leftSection);
        header.appendChild(actions);
        
        return header;
    }
    
    createConfigPrompt() {
        const prompt = document.createElement('div');
        prompt.className = 'config-prompt simple';
        
        prompt.innerHTML = `
            <div class="config-content">
                <div class="config-icon">🤖</div>
                <h3>Set up AI chat</h3>
                <p>Connect your AI provider to start chatting</p>
                <button onclick="window.enhancedChatPanel.showSettings()" class="config-button">
                    Configure
                </button>
            </div>
        `;
        
        return prompt;
    }
    
    buildProviderOptions() {
        // Only show OpenAI/Custom option, not Claude
        return `<option value="openai">OpenAI/Custom</option>`;
    }
    
    getProviderStatusIcon() {
        const provider = this.providers[this.currentProvider];
        
        switch (provider.status) {
            case 'ready':
                return '🟢';
            case 'not-configured':
                return '⚫';
            case 'error':
                return '🔴';
            default:
                return '🟡';
        }
    }
    
    async switchProvider(providerKey) {
        console.log('🔄 Switching to provider:', providerKey);
        
        this.currentProvider = providerKey;
        
        // Update UI
        this.updateUI();
        
        // Save preference
        localStorage.setItem('gaimplan-chat-provider', providerKey);
    }
    
    async refreshProviders() {
        console.log('🔄 Refreshing providers...');
        await this.initializeProviders();
        this.updateUI();
    }
    
    showSettings() {
        console.log('⚙️ Showing settings');
        this.showingSettings = true;
        this.updateUI();
    }
    
    hideSettings() {
        console.log('⚙️ Hiding settings');
        this.showingSettings = false;
        this.updateUI();
    }
    
    async handleSendMessage(message) {
        try {
            const provider = this.providers[this.currentProvider];
            
            console.log('Current provider:', this.currentProvider, provider);
            
            if (!provider.configured) {
                this.interface.addMessage({
                    type: 'error',
                    content: `${provider.name} is not configured. Please check your settings.`,
                    timestamp: new Date()
                });
                return;
            }
            
            if (!provider.sdk) {
                this.interface.addMessage({
                    type: 'error',
                    content: `${provider.name} SDK is not initialized. Please refresh the page.`,
                    timestamp: new Date()
                });
                return;
            }
            
            // Add user message to the interface
            this.interface.addMessage({
                type: 'user',
                content: message,
                timestamp: new Date()
            });
            
            // Show thinking indicator IMMEDIATELY after user message
            const settings = provider.sdk.getSettings();
            const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
            this.interface.showTyping(isOllama);
            
            // Small delay to ensure UI updates are visible
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Get context from ChatInterface (what's shown in the pills)
            const allContext = await this.getAllContext();
            console.log('All context from pills:', allContext);
            console.log('Context details:');
            allContext.forEach((ctx, i) => {
                console.log(`  Context ${i}: ${ctx.title} - ${ctx.content?.length || 0} chars`);
            });
            
            // 🏷️ TAG CONTEXT EXPANSION
            const tagEnhancement = await tagContextExpander.enhanceConversationWithTags(message, allContext);
            if (tagEnhancement) {
                console.log('🎯 Tag enhancement applied:', tagEnhancement.relatedTags.map(t => `#${t.tag}`).join(', '));
                
                // Add tag context message to show discovered tags
                if (tagEnhancement.relatedTags.length > 0) {
                    const tagsList = tagEnhancement.relatedTags.map(t => `#${t.tag}`).join(', ');
                    this.interface.addMessage({
                        type: 'context',
                        content: `🏷️ Related tags: ${tagsList}`,
                        timestamp: new Date()
                    });
                }
                
                // Add any additional context notes found via tags
                if (tagEnhancement.additionalContext.length > 0) {
                    const additionalFiles = tagEnhancement.additionalContext.map(note => note.file).join(', ');
                    this.interface.addMessage({
                        type: 'context',
                        content: `📎 Additional context via tags: ${additionalFiles}`,
                        timestamp: new Date()
                    });
                }
            }
            
            // Add context message to show which files were included
            if (allContext.length > 0) {
                const contextFileNames = allContext.map(ctx => ctx.title).join(', ');
                this.interface.addMessage({
                    type: 'context',
                    content: `Context: ${contextFileNames}`,
                    timestamp: new Date()
                });
            }
            
            
            let response = '';
            
            if (this.currentProvider === 'claude') {
                // Use Claude SDK
                response = await provider.sdk.sendMessage(message, allContext);
                this.interface.hideTyping();
                this.interface.addMessage({
                    type: 'assistant',
                    content: response,
                    timestamp: new Date()
                });
            } else if (this.currentProvider === 'openai') {
                // Use OpenAI SDK
                // Get conversation history for context (excluding errors and context messages)
                const conversationHistory = this.interface.getMessages() || [];
                const formattedHistory = conversationHistory
                    .filter(msg => msg.type !== 'error' && msg.type !== 'context') // Exclude error and context messages
                    .map(msg => ({
                        role: msg.type === 'user' ? 'user' : 'assistant',
                        content: msg.content
                    }));
                
                // Format messages with history and tag context
                console.log('Formatting messages with context:', allContext.length, 'notes');
                const messages = await provider.sdk.formatMessages(message, allContext, tagEnhancement);
                console.log('Formatted messages:', messages.length, 'total');
                
                // Add conversation history before the current message (but after system messages)
                const systemMessages = messages.filter(m => m.role === 'system');
                const currentUserMessage = messages.find(m => m.role === 'user');
                
                // Only include history messages that aren't the current message
                const historyWithoutCurrent = formattedHistory.filter(
                    msg => !(msg.role === 'user' && msg.content === message)
                );
                
                const fullMessages = [
                    ...systemMessages,
                    ...historyWithoutCurrent.slice(-10), // Include last 10 messages for context
                    currentUserMessage
                ].filter(Boolean);
                
                // Debug: Check if context is in messages
                const hasContextMessage = fullMessages.some(msg => 
                    msg.role === 'system' && msg.content.includes('CURRENT CONTEXT')
                );
                console.log('Has context in fullMessages?', hasContextMessage);
                
                console.log('Sending messages to OpenAI:', fullMessages);
                console.log('Messages array length:', fullMessages.length);
                
                if (!fullMessages || fullMessages.length === 0) {
                    throw new Error('No messages to send');
                }
                
                // Check if MCP tools are available
                let mcpFunctions = [];
                try {
                    mcpFunctions = await mcpToolHandler.getOpenAIFunctions();
                    console.log('Available MCP functions:', mcpFunctions.length);
                } catch (error) {
                    console.log('No MCP functions available:', error);
                }
                
                // Log model info
                const settings = provider.sdk.getSettings();
                const model = settings?.model || '';
                console.log(`Model: ${model}`);
                
                try {
                    let response;
                    
                    // Check if we should use prompt-based tool calling
                    const usePromptTools = gemmaPromptToolCalling.supportsPromptTools(model) && 
                                         !settings?.endpoint?.includes('openai.com');
                    
                    // Check if we should use streaming based on the provider
                    const useStreaming = this.shouldUseStreaming(provider.sdk);
                    
                    if (mcpFunctions.length > 0 && usePromptTools) {
                        // Use prompt-based tool calling for Gemma and similar models
                        console.log('Using prompt-based tool calling for', model);
                        response = await this.handlePromptBasedToolCalling(
                            provider.sdk,
                            fullMessages,
                            mcpFunctions,
                            allContext
                        );
                        
                        // Add response to UI if not already added
                        if (response && typeof response === 'string') {
                            this.interface.addMessage({
                                type: 'assistant',
                                content: response,
                                timestamp: new Date()
                            });
                        }
                    } else if (mcpFunctions.length > 0) {
                        // Use function calling if MCP tools are available
                        console.log('Using function calling with MCP tools');
                        if (useStreaming) {
                            await this.handleStreamingFunctionResponse(
                                provider.sdk,
                                fullMessages,
                                mcpFunctions,
                                allContext
                            );
                        } else {
                            response = await this.handleFunctionCallingResponse(
                                provider.sdk,
                                fullMessages,
                                mcpFunctions,
                                allContext
                            );
                            
                            // Response is already added in handleFunctionCallingResponse
                        }
                    } else {
                        // Regular chat without functions
                        if (useStreaming) {
                            await this.handleStreamingResponse(provider.sdk, fullMessages);
                        } else {
                            response = await provider.sdk.sendChat(fullMessages);
                            
                            // Handle non-streaming response
                            if (response && response.choices && response.choices[0]) {
                                const content = response.choices[0].message?.content || '';
                                this.interface.addMessage({
                                    type: 'assistant',
                                    content: content,
                                    timestamp: new Date()
                                });
                            }
                        }
                    }
                } catch (chatError) {
                    console.error('Chat error:', chatError);
                    this.interface.hideTyping();
                    throw chatError;
                }
            }
            
            // Save conversation
            this.saveConversation();
            
        } catch (error) {
            console.error('Error sending message:', error);
            this.interface.hideTyping();
            this.interface.addMessage({
                type: 'error',
                content: `Error: ${error.message}`,
                timestamp: new Date()
            });
        }
    }
    
    shouldUseStreaming(sdk) {
        // Check if the provider supports streaming
        const settings = sdk.getSettings();
        if (!settings) return true; // Default to streaming
        
        // Ollama native endpoints don't support streaming well
        const isOllamaNative = (settings.endpoint?.includes('ollama') || settings.endpoint?.includes('11434')) 
                               && !settings.endpoint?.includes('/v1');
        
        // Only use streaming for OpenAI-compatible endpoints
        return !isOllamaNative;
    }
    
    async getAllContext() {
        // Get all context from the ChatInterface (what's shown in the pills)
        const contextNotes = [];
        
        // Get active note
        console.log('Getting all context...');
        const activeNote = await this.getActiveNoteContent();
        console.log('Active note:', activeNote ? `Found: ${activeNote.title}` : 'None');
        
        if (activeNote) {
            contextNotes.push(activeNote);
        }
        
        // Get mentioned notes from currentContext
        const mentionedNotes = this.interface.currentContext || [];
        console.log('Mentioned notes:', mentionedNotes.length);
        
        for (const note of mentionedNotes) {
            const content = await this.getNoteContent(note.path);
            if (content) {
                contextNotes.push({
                    title: note.title || note.name,
                    content: content,
                    path: note.path
                });
            }
        }
        
        console.log('Total context notes:', contextNotes.length);
        return contextNotes;
    }
    
    async getActiveNoteContent() {
        // Get current note content from CodeMirror
        console.log('Getting active note content...');
        
        if (!window.paneManager) {
            console.log('No paneManager found');
            return null;
        }
        
        const activeTabManager = window.paneManager.getActiveTabManager();
        console.log('Active tab manager:', activeTabManager);
        
        if (!activeTabManager) {
            console.log('No active tab manager');
            return null;
        }
        
        const activeTab = activeTabManager.getActiveTab();
        console.log('Active tab:', activeTab);
        
        if (!activeTab) {
            console.log('No active tab');
            return null;
        }
        
        const title = activeTab.title || 'Current Note';
        const filePath = activeTab.filePath;
        
        // Try to get content from editor first
        let content = '';
        
        if (activeTab.editor) {
            // activeTab.editor is a MarkdownEditor instance
            // Use the getContent method if available
            if (typeof activeTab.editor.getContent === 'function') {
                content = activeTab.editor.getContent();
            } else if (activeTab.editor.view) {
                content = activeTab.editor.view.state.doc.toString();
            } else if (activeTab.editor.state) {
                content = activeTab.editor.state.doc.toString();
            }
        }
        
        // If we couldn't get content from editor, try reading from file
        if ((!content || content.length === 0) && filePath) {
            console.log('⚠️ No content from editor, trying to read from file:', filePath);
            try {
                content = await this.getNoteContent(filePath);
                console.log('Got content from file:', content?.length || 0, 'chars');
            } catch (error) {
                console.error('Failed to read file:', error);
            }
        }
        
        if (!content || content.length === 0) {
            console.error('⚠️ No content found! This is why context is lost.');
            return null;
        }
        
        console.log('Got content from:', title, 'Length:', content.length);
        
        // Truncate if too long
        const maxLength = 8000;
        const truncatedContent = content.length > maxLength 
            ? content.substring(0, maxLength) + '...[truncated]'
            : content;
        
        return {
            title: title,
            content: truncatedContent,
            path: filePath
        };
    }
    
    async getNoteContent(path) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const content = await invoke('read_file_content', {
                filePath: path
            });
            
            // Truncate if too long
            const maxLength = 8000;
            return content.length > maxLength 
                ? content.substring(0, maxLength) + '...[truncated]'
                : content;
        } catch (error) {
            console.error('Error reading note content:', error);
            return null;
        }
    }
    
    
    showAddToNoteButton(messageId, content) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'message-actions';
            buttonContainer.innerHTML = `
                <button onclick="window.enhancedChatPanel.addToActiveNote('${messageId}')">
                    Add to Note
                </button>
            `;
            messageEl.appendChild(buttonContainer);
        }
    }
    
    async addToActiveNote(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        const content = messageEl.querySelector('.message-content').textContent;
        
        if (window.paneManager) {
            const activeTab = window.paneManager.getActiveTabManager()?.getActiveTab();
            if (activeTab && activeTab.editor) {
                const view = activeTab.editor;
                const state = view.state;
                const cursorPos = state.selection.main.head;
                
                const transaction = state.update({
                    changes: {
                        from: cursorPos,
                        to: cursorPos,
                        insert: `\n\n${content}\n\n`
                    }
                });
                
                view.dispatch(transaction);
                this.showNotification('Added to note');
            } else {
                this.showNotification('No active note to add to', 'error');
            }
        }
    }
    
    showNotification(message, type = 'success') {
        console.log(`📢 ${type}: ${message}`);
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `chat-notification ${type}`;
        notification.textContent = message;
        
        // Add to container
        if (this.container) {
            this.container.appendChild(notification);
            
            // Remove after 3 seconds
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }
    
    updateUI() {
        if (!this.container) return;
        
        const wrapper = this.container.querySelector('.chat-content-wrapper');
        if (wrapper) {
            this.buildUI(wrapper);
        }
        
        // Make this instance globally available
        window.enhancedChatPanel = this;
    }
    
    // Toggle right sidebar visibility
    toggle() {
        try {
            console.log(`🔄 Toggling chat panel visibility: ${this.isVisible} -> ${!this.isVisible}`);
            
            this.isVisible = !this.isVisible;
            const rightSidebar = document.getElementById('right-sidebar');
            const chatToggleBtn = document.querySelector('.chat-toggle-btn');
            
            if (!rightSidebar) {
                console.error('❌ Right sidebar element not found');
                return;
            }
            
            if (this.isVisible) {
                rightSidebar.classList.add('visible');
                // Apply saved width if available
                const savedWidth = localStorage.getItem('chatPanelWidth');
                if (savedWidth) {
                    rightSidebar.style.width = savedWidth + 'px';
                }
                console.log('✅ Chat panel shown');
            } else {
                rightSidebar.classList.remove('visible');
                // Remove inline width style to ensure CSS takes over
                rightSidebar.style.width = '';
                console.log('✅ Chat panel hidden');
            }
            
            // Update button active state
            if (chatToggleBtn) {
                if (this.isVisible) {
                    chatToggleBtn.classList.add('active');
                } else {
                    chatToggleBtn.classList.remove('active');
                }
            } else {
                console.warn('⚠️ Chat toggle button not found');
            }
            
            // Save visibility state
            localStorage.setItem('gaimplan-chat-visible', this.isVisible.toString());
            
            console.log('💬 Chat panel toggled:', this.isVisible ? 'visible' : 'hidden');
            
        } catch (error) {
            console.error('❌ Error toggling chat panel:', error);
            // Reset state on error
            this.isVisible = !this.isVisible;
            throw error;
        }
    }
    
    loadSavedProvider() {
        // Always use OpenAI, ignore any saved Claude preference
        this.currentProvider = 'openai';
        localStorage.setItem('gaimplan-chat-provider', 'openai');
        
        // Load saved visibility state
        const savedVisibility = localStorage.getItem('gaimplan-chat-visible');
        if (savedVisibility === 'true') {
            this.isVisible = true;
            const rightSidebar = document.getElementById('right-sidebar');
            const chatToggleBtn = document.querySelector('.chat-toggle-btn');
            
            if (rightSidebar) {
                rightSidebar.classList.add('visible');
            }
            if (chatToggleBtn) {
                chatToggleBtn.classList.add('active');
            }
        }
    }
    
    clearChat() {
        this.interface.clearMessages();
        this.persistence.clearHistory();
    }
    
    async exportChat() {
        console.log('💾 Exporting chat...');
        
        try {
            // Get all messages
            const messages = this.interface.getMessages();
            if (!messages || messages.length === 0) {
                alert('No messages to export');
                return;
            }
            
            // Format chat as markdown with context information
            let markdown = '# Chat Export\n\n';
            markdown += `**Date**: ${new Date().toLocaleString()}\n`;
            markdown += `**Provider**: ${this.providers[this.currentProvider].name}\n`;
            markdown += `**Messages**: ${messages.length}\n\n`;
            
            // Add context information if available
            const contextIndicator = document.getElementById('chat-context-indicator');
            const contextPills = contextIndicator?.querySelectorAll('.context-pill');
            if (contextPills && contextPills.length > 0) {
                markdown += '## Context Used\n\n';
                contextPills.forEach(pill => {
                    const noteName = pill.querySelector('span')?.textContent || 'Unknown';
                    const isActive = pill.classList.contains('active-note');
                    markdown += `- ${noteName}${isActive ? ' (Active Note)' : ''}\n`;
                });
                markdown += '\n';
            }
            
            markdown += '## Conversation\n\n';
            
            messages.forEach((msg, index) => {
                const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
                
                if (msg.type === 'user') {
                    markdown += `### You - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'assistant') {
                    markdown += `### AI - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'error') {
                    markdown += `### Error - ${timestamp}\n${msg.content}\n\n`;
                } else if (msg.type === 'context') {
                    markdown += `*${msg.content}*\n\n`;
                }
            });
            
            // Export to vault's Chat History folder
            const { invoke } = await import('@tauri-apps/api/core');
            
            const filePath = await invoke('export_chat_to_vault', {
                content: markdown,
                filename: null // Let the backend generate timestamp-based filename
            });
            
            console.log('✅ Chat exported successfully to:', filePath);
            this.showNotification('Chat exported to Chat History folder');
            
            // Refresh the file tree to show the new file
            // This will trigger the file tree update if it's listening for changes
            window.dispatchEvent(new CustomEvent('vault-files-changed'));
            
            // Also try direct refresh as a fallback
            if (window.refreshFileTree) {
                console.log('📁 Directly refreshing file tree...');
                window.refreshFileTree();
            }
            
        } catch (error) {
            console.error('Error exporting chat:', error);
            this.showNotification('Failed to export chat', 'error');
        }
    }
    
    saveConversation() {
        // Save current conversation
        const messages = this.interface.getMessages();
        this.persistence.saveHistory(messages);
    }
    
    loadChatHistory() {
        const history = this.persistence.loadHistory();
        if (history && history.length > 0) {
            this.interface.loadMessages(history);
        }
    }
    
    async handleFunctionCallingResponse(sdk, messages, functions, context) {
        console.log('🔧 Handling function calling response');
        
        // Send initial request with functions
        const response = await sdk.sendChatWithFunctions(messages, functions);
        console.log('Initial response:', response);
        
        // Check if the model wants to call a function
        if (response.choices && response.choices[0]) {
            const choice = response.choices[0];
            
            // Debug: Log the actual message structure
            console.log('Choice message:', choice.message);
            console.log('Has function_call?', !!choice.message?.function_call);
            console.log('Has tool_calls?', !!choice.message?.tool_calls);
            
            // Check for both OpenAI and Ollama formats
            let functionCall = null;
            
            if (choice.message && choice.message.function_call) {
                // OpenAI format
                functionCall = choice.message.function_call;
            } else if (choice.message && choice.message.tool_calls && choice.message.tool_calls.length > 0) {
                // Ollama format - extract first tool call
                const toolCall = choice.message.tool_calls[0];
                if (toolCall.function) {
                    functionCall = {
                        name: toolCall.function.name,
                        arguments: typeof toolCall.function.arguments === 'string' 
                            ? toolCall.function.arguments 
                            : JSON.stringify(toolCall.function.arguments)
                    };
                }
            }
            
            if (functionCall) {
                // AI wants to call a function
                console.log('AI wants to call function:', functionCall.name);
                
                // Show tool usage in UI
                const toolDisplay = mcpToolHandler.createToolUsageDisplay(
                    functionCall.name,
                    functionCall.name.split('_')[0], // Extract server name from function name
                    'running'
                );
                this.interface.addElement(toolDisplay);
                
                try {
                    // Execute the function
                    const args = JSON.parse(functionCall.arguments);
                    const result = await mcpToolHandler.executeTool(functionCall.name, args);
                    
                    console.log('Tool execution result:', result);
                    
                    // Update tool display
                    const statusElement = toolDisplay.querySelector('.tool-status');
                    statusElement.textContent = result.success ? '✅' : '❌';
                    statusElement.classList.remove('spinning');
                    toolDisplay.querySelector('.tool-usage-status').textContent = 
                        result.success ? 'Completed successfully' : `Failed: ${result.error}`;
                    
                    // Add function response to messages
                    // Check if we need tools format (Ollama/Gemini)
                    const settings = sdk.getSettings();
                    const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
                    const isGemini = settings?.endpoint?.includes('generativelanguage.googleapis.com');
                    const useToolsFormat = isOllama || isGemini;
                    
                    let updatedMessages;
                    
                    if (useToolsFormat) {
                        // Tools format for Ollama/Gemini
                        const toolCallId = 'call_' + Date.now();
                        
                        if (isGemini) {
                            // Gemini format - include function name in the response
                            updatedMessages = [
                                ...messages,
                                {
                                    role: 'assistant',
                                    content: choice.message.content || '',
                                    tool_calls: [{
                                        id: toolCallId,
                                        type: 'function',
                                        function: functionCall
                                    }]
                                },
                                {
                                    role: 'tool',
                                    content: result.success ? result.result : `Error: ${result.error}`,
                                    tool_call_id: toolCallId,
                                    name: functionCall.name  // Gemini requires the function name
                                }
                            ];
                        } else {
                            // Ollama format
                            updatedMessages = [
                                ...messages,
                                {
                                    role: 'assistant',
                                    content: choice.message.content || '',
                                    tool_calls: [{
                                        id: toolCallId,
                                        type: 'function',
                                        function: functionCall
                                    }]
                                },
                                {
                                    role: 'tool',
                                    content: result.success ? result.result : `Error: ${result.error}`,
                                    tool_call_id: toolCallId
                                }
                            ];
                        }
                    } else {
                        // OpenAI format
                        const functionMessage = {
                            role: 'function',
                            name: functionCall.name,
                            content: result.success ? result.result : `Error: ${result.error}`
                        };
                        
                        updatedMessages = [
                            ...messages,
                            {
                                role: 'assistant',
                                content: choice.message.content || '',
                                function_call: functionCall
                            },
                            functionMessage
                        ];
                    }
                    
                    // Send another request with the function result
                    const finalResponse = await sdk.sendChat(updatedMessages);
                    
                    // Extract content from response and add to UI
                    if (finalResponse.choices && finalResponse.choices[0] && finalResponse.choices[0].message) {
                        const content = finalResponse.choices[0].message.content || '';
                        this.interface.addMessage({
                            type: 'assistant',
                            content: content,
                            timestamp: new Date()
                        });
                        return content;
                    }
                    
                    return finalResponse;
                    
                } catch (error) {
                    console.error('Function execution error:', error);
                    
                    // Update tool display
                    const statusElement = toolDisplay.querySelector('.tool-status');
                    statusElement.textContent = '❌';
                    statusElement.classList.remove('spinning');
                    toolDisplay.querySelector('.tool-usage-status').textContent = `Failed: ${error.message}`;
                    
                    // Return error message
                    return `I tried to use a tool but encountered an error: ${error.message}`;
                }
            } else if (choice.message && choice.message.content) {
                // Regular response without function call
                console.log('Model returned regular content without function call');
                this.interface.addMessage({
                    type: 'assistant',
                    content: choice.message.content,
                    timestamp: new Date()
                });
                return choice.message.content;
            }
        }
        
        throw new Error('Unexpected response format from AI');
    }
    
    async handlePromptBasedToolCalling(sdk, messages, functions, context) {
        console.log('🔧 Handling prompt-based tool calling');
        
        // Add tool descriptions to the system message
        const toolPrompt = gemmaPromptToolCalling.formatToolsForPrompt(functions);
        
        // Modify the system message to include tools
        const modifiedMessages = messages.map(msg => {
            if (msg.role === 'system' && !msg.content.includes('To use a tool')) {
                return {
                    ...msg,
                    content: msg.content + '\n\n' + toolPrompt
                };
            }
            return msg;
        });
        
        // Send initial request
        const response = await sdk.sendChat(modifiedMessages);
        console.log('Initial response:', response);
        
        // Check if the response contains a tool call
        const toolCall = gemmaPromptToolCalling.extractToolCall(response);
        
        if (toolCall) {
            console.log('Detected tool call:', toolCall);
            
            // Show tool usage in UI
            const toolDisplay = mcpToolHandler.createToolUsageDisplay(
                toolCall.name,
                toolCall.name.split('_')[0], // Extract server name from function name
                'running'
            );
            this.interface.addElement(toolDisplay);
            
            try {
                // Execute the function
                const args = JSON.parse(toolCall.arguments);
                const result = await mcpToolHandler.executeTool(toolCall.name, args);
                
                console.log('Tool execution result:', result);
                
                // Update tool display
                const statusElement = toolDisplay.querySelector('.tool-status');
                statusElement.textContent = result.success ? '✅' : '❌';
                statusElement.classList.remove('spinning');
                toolDisplay.querySelector('.tool-usage-status').textContent = 
                    result.success ? 'Completed successfully' : `Failed: ${result.error}`;
                
                // Add the tool result to the conversation
                const toolResultMessage = {
                    role: 'user',
                    content: `${gemmaPromptToolCalling.formatToolResult(result)}\n\nBased on this tool result, please provide a natural language response to the user's original question.`
                };
                
                const updatedMessages = [
                    ...modifiedMessages,
                    {
                        role: 'assistant',
                        content: response
                    },
                    toolResultMessage
                ];
                
                // Get final response with tool result
                const finalResponse = await sdk.sendChat(updatedMessages);
                return finalResponse;
                
            } catch (error) {
                console.error('Function execution error:', error);
                
                // Update tool display
                const statusElement = toolDisplay.querySelector('.tool-status');
                statusElement.textContent = '❌';
                statusElement.classList.remove('spinning');
                toolDisplay.querySelector('.tool-usage-status').textContent = `Failed: ${error.message}`;
                
                // Return error message
                return `I tried to use a tool but encountered an error: ${error.message}`;
            }
        } else {
            // No tool call detected, return the response as is
            return response;
        }
    }
    
    /**
     * MCP tools indicator removed for cleaner UI
     */
    
    async testMCPConnection() {
        console.log('🧪 Testing MCP connection...');
        
        try {
            // Show status
            this.showNotification('Testing basic MCP functionality...');
            
            // Use invoke directly to test
            const { invoke } = await import('@tauri-apps/api/core');
            
            // First, test if the commands are available
            console.log('Testing get_mcp_server_statuses...');
            
            try {
                const statuses = await invoke('get_mcp_server_statuses');
                console.log('✅ get_mcp_server_statuses works:', statuses);
                this.showNotification('Basic MCP commands working!', 'success');
            } catch (e) {
                console.error('❌ get_mcp_server_statuses failed:', e);
                this.showNotification(`MCP commands failed: ${e.message}`, 'error');
                return;
            }
            
            // Test basic process spawning first
            console.log('Testing basic process spawning...');
            this.showNotification('Testing basic spawn...', 'info');
            
            try {
                const spawnResult = await invoke('test_process_spawn');
                console.log('✅ Basic spawn test:', spawnResult);
                this.showNotification('Basic spawn works!', 'success');
            } catch (e) {
                console.error('❌ Basic spawn failed:', e);
                this.showNotification(`Basic spawn failed: ${e.message}`, 'error');
                return;
            }
            
            // Now test the echo server
            console.log('Testing echo server...');
            this.showNotification('Testing echo server...', 'info');
            
            try {
                const echoResult = await invoke('test_stdio_echo');
                console.log('✅ Echo test:', echoResult);
                this.showNotification('Echo test completed!', 'success');
            } catch (e) {
                console.error('❌ Echo test failed:', e);
                this.showNotification(`Echo test failed: ${e.message}`, 'error');
            }
            
        } catch (error) {
            console.error('MCP test failed:', error);
            console.error('Error stack:', error.stack);
            this.showNotification(`MCP test failed: ${error.message}`, 'error');
        }
        
        // Final summary
        setTimeout(() => {
            console.log('🎯 MCP Test Summary:');
            console.log('✅ Basic MCP commands working');
            console.log('🔧 Process spawning needs refinement for long-running servers');
            console.log('🚀 Ready for next phase: Real MCP server testing');
            
            // Add a button for testing the real Node.js MCP server
            console.log('💡 To test the real Node.js MCP server, check browser console for testRealMCP()');
            
            // Add basic spawn test
            window.testSpawn = async () => {
                console.log('🧪 Testing basic process spawn...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_process_spawn');
                    console.log('✅ Spawn test result:', result);
                } catch (error) {
                    console.error('❌ Spawn test failed:', error);
                }
            };
            
            // Add direct MCP test
            window.testMCPDirect = async () => {
                console.log('🧪 Testing direct MCP communication...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_mcp_direct');
                    console.log('✅ Direct MCP test result:', result);
                } catch (error) {
                    console.error('❌ Direct MCP test failed:', error);
                }
            };
            
            // Add transport test
            window.testTransport = async () => {
                console.log('🧪 Testing transport layer...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_transport_direct');
                    console.log('✅ Transport test result:', result);
                } catch (error) {
                    console.error('❌ Transport test failed:', error);
                }
            };
            
            // Add echo test
            window.testEcho = async () => {
                console.log('🧪 Testing stdio echo...');
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const result = await invoke('test_stdio_echo');
                    console.log('✅ Echo test result:', result);
                } catch (error) {
                    console.error('❌ Echo test failed:', error);
                }
            };
            
            window.testRealMCP = async () => {
                console.log('🧪 Testing Real Node.js MCP Server...');
                
                try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    
                    const nodeConfig = {
                        enabled: true,
                        transport: {
                            type: 'stdio',
                            command: 'node',
                            args: ['./mcp-servers/test-server/index.js'],
                            env: {},
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
                            write: false,
                            delete: false,
                            external_access: false
                        }
                    };
                    
                    console.log('Starting Node.js MCP server...');
                    console.log('Config:', JSON.stringify(nodeConfig, null, 2));
                    
                    // Add timeout to see if it's hanging
                    const startPromise = invoke('start_mcp_server', {
                        serverId: 'node-test',
                        config: nodeConfig
                    });
                    
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Server start timeout after 30s')), 30000);
                    });
                    
                    await Promise.race([startPromise, timeoutPromise]);
                    
                    console.log('✅ Node.js MCP server started successfully!');
                    
                    // Check server status
                    const statuses = await invoke('get_mcp_server_statuses');
                    console.log('📊 Server statuses:', statuses);
                    
                } catch (error) {
                    console.error('❌ Node.js MCP test failed:', error);
                    console.error('Full error:', error.stack);
                }
            };
        }, 3000);
    }
    
    async handleStreamingResponse(sdk, messages) {
        console.log('🌊 Starting streaming response');
        
        // Hide typing indicator
        this.interface.hideTyping();
        
        // Create a new message for streaming
        const messageId = 'msg_' + Date.now();
        const streamingMessage = {
            id: messageId,
            type: 'assistant',
            content: '',
            timestamp: new Date()
        };
        
        // Add empty message to UI
        this.interface.addMessage(streamingMessage);
        
        // Set up streaming callbacks
        const callbacks = {
            onToken: (token) => {
                console.log('📝 Received token:', token);
                // Accumulate content
                streamingMessage.content += token;
                // Update the message in the UI
                this.interface.updateMessage(messageId, streamingMessage.content);
            },
            
            onError: (error) => {
                console.error('Streaming error:', error);
                this.interface.finalizeStreamingMessage(messageId);
                this.interface.addMessage({
                    type: 'error',
                    content: `Stream error: ${error.message}`,
                    timestamp: new Date()
                });
            },
            
            onDone: () => {
                console.log('✅ Streaming complete - final content length:', streamingMessage.content.length);
                if (streamingMessage.content.length === 0) {
                    console.warn('⚠️ No content received during streaming - this may indicate an API issue');
                }
                this.interface.finalizeStreamingMessage(messageId);
            }
        };
        
        // Start streaming
        try {
            await sdk.sendChatStream(messages, callbacks);
        } catch (error) {
            console.error('Failed to start stream:', error);
            this.interface.hideTyping();
            throw error;
        }
    }
    
    async handleStreamingFunctionResponse(sdk, messages, functions, context) {
        console.log('🌊 Starting streaming response with functions');
        
        // Hide typing indicator
        this.interface.hideTyping();
        
        // Create a new message for streaming
        const messageId = 'msg_' + Date.now();
        const streamingMessage = {
            id: messageId,
            type: 'assistant',
            content: '',
            timestamp: new Date()
        };
        
        // Add empty message to UI
        this.interface.addMessage(streamingMessage);
        
        // Variables to track function calls
        let functionCallName = '';
        let functionCallArgs = '';
        let isAccumulatingFunction = false;
        
        // Set up streaming callbacks
        const callbacks = {
            onToken: (token) => {
                // Regular content token
                streamingMessage.content += token;
                this.interface.updateMessage(messageId, streamingMessage.content);
            },
            
            onFunctionCall: async (functionCall) => {
                console.log('Function call during stream:', functionCall);
                
                // Accumulate function call data
                if (functionCall.name) {
                    functionCallName = functionCall.name;
                    isAccumulatingFunction = true;
                }
                if (functionCall.arguments) {
                    functionCallArgs += functionCall.arguments;
                }
            },
            
            onToolCall: async (toolCall) => {
                console.log('Tool call during stream:', toolCall);
                
                // Handle tool calls similarly
                if (toolCall.name && toolCall.arguments) {
                    await this.executeToolCall(toolCall.name, toolCall.arguments, messageId);
                }
            },
            
            onError: (error) => {
                console.error('Streaming error:', error);
                this.interface.finalizeStreamingMessage(messageId);
                this.interface.addMessage({
                    type: 'error',
                    content: `Stream error: ${error.message}`,
                    timestamp: new Date()
                });
            },
            
            onDone: async () => {
                console.log('✅ Streaming complete');
                
                // If we accumulated a function call, execute it
                if (isAccumulatingFunction && functionCallName && functionCallArgs) {
                    console.log('Executing accumulated function:', functionCallName);
                    try {
                        // Parse the arguments
                        const args = JSON.parse(functionCallArgs);
                        
                        // Execute the function
                        await this.executeToolCall(functionCallName, args, messageId);
                        
                    } catch (error) {
                        console.error('Failed to execute function:', error);
                        this.interface.addMessage({
                            type: 'error',
                            content: `Failed to execute function: ${error.message}`,
                            timestamp: new Date()
                        });
                    }
                }
                
                this.interface.finalizeStreamingMessage(messageId);
            }
        };
        
        // Start streaming with functions
        try {
            await sdk.sendChatWithFunctionsStream(messages, functions, callbacks);
        } catch (error) {
            console.error('Failed to start stream:', error);
            this.interface.hideTyping();
            throw error;
        }
    }
    
    async executeToolCall(functionName, args, messageId) {
        console.log('🔧 Executing tool call:', functionName, args);
        
        // Parse arguments if they're a string
        let parsedArgs = args;
        if (typeof args === 'string') {
            try {
                parsedArgs = JSON.parse(args);
                console.log('Parsed string arguments:', parsedArgs);
            } catch (e) {
                console.error('Failed to parse arguments:', e);
                parsedArgs = args; // Use as-is if parsing fails
            }
        }
        
        // Show tool usage in UI
        const toolUsageElement = document.createElement('div');
        toolUsageElement.className = 'tool-usage';
        toolUsageElement.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">🔧</span>
                <span class="tool-name">${functionName}</span>
                <span class="tool-status">Running...</span>
            </div>
        `;
        
        this.interface.addElement(toolUsageElement);
        
        try {
            // Execute the tool with parsed arguments
            const result = await mcpToolHandler.executeTool(functionName, parsedArgs);
            
            // Update tool status
            toolUsageElement.querySelector('.tool-status').textContent = 'Success';
            toolUsageElement.querySelector('.tool-status').classList.add('success');
            
            // Continue conversation with tool result
            // Check if we need tools format
            const settings = this.providers[this.currentProvider].sdk.getSettings();
            const isGemini = settings?.endpoint?.includes('generativelanguage.googleapis.com');
            const isOllama = settings?.endpoint?.includes('ollama') || settings?.endpoint?.includes('11434');
            
            let toolResultMessage;
            if (isGemini || isOllama) {
                // Tools format
                toolResultMessage = {
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: messageId  // Use the messageId as tool_call_id
                };
                
                // Gemini requires the function name
                if (isGemini) {
                    toolResultMessage.name = functionName;
                    console.log('Added name field for Gemini:', functionName);
                    
                    // For Gemini, modify the tool result to explicitly request a response
                    const toolResult = JSON.parse(toolResultMessage.content);
                    if (toolResult.success && toolResult.result) {
                        toolResultMessage.content = JSON.stringify({
                            ...toolResult,
                            instruction: "Please analyze this tool result and provide a helpful response to the user's original question."
                        });
                    }
                }
            } else {
                // OpenAI format
                toolResultMessage = {
                    role: 'function',
                    name: functionName,
                    content: JSON.stringify(result)
                };
            }
            
            // Get current messages and add tool result
            // We need to reconstruct the assistant message with the tool call
            const currentMessages = this.interface.messages
                .filter(m => m.type === 'user' || m.type === 'assistant')
                .slice(0, -1)  // Remove the last assistant message (which is empty)
                .map(m => ({
                    role: m.type === 'user' ? 'user' : 'assistant',
                    content: m.content
                }));
            
            // Add the assistant message with the tool call
            const assistantWithToolCall = {
                role: 'assistant',
                content: '',  // Gemini expects empty content with tool calls
                tool_calls: [{
                    id: messageId,
                    type: 'function',
                    function: {
                        name: functionName,
                        arguments: JSON.stringify(parsedArgs)
                    }
                }]
            };
            
            currentMessages.push(assistantWithToolCall);
            currentMessages.push(toolResultMessage);
            
            // For Gemini, add an explicit request for response after tool result
            if (isGemini) {
                currentMessages.push({
                    role: 'user',
                    content: 'Based on the tool result above, please provide a helpful response to my original question.'
                });
            }
            
            // Debug: Log the messages being sent
            console.log('Messages being sent to streaming API (total:', currentMessages.length, ')');
            currentMessages.forEach((msg, i) => {
                console.log(`Message ${i}:`, {
                    role: msg.role,
                    content: msg.content?.substring(0, 100) || '',
                    tool_calls: msg.tool_calls,
                    tool_call_id: msg.tool_call_id,
                    name: msg.name
                });
            });
            
            // Continue streaming with tool result
            await this.handleStreamingResponse(this.providers[this.currentProvider].sdk, currentMessages);
            
        } catch (error) {
            console.error('Tool execution failed:', error);
            
            // Update tool status
            toolUsageElement.querySelector('.tool-status').textContent = 'Failed';
            toolUsageElement.querySelector('.tool-status').classList.add('error');
            
            this.interface.addMessage({
                type: 'error',
                content: `Tool execution failed: ${error.message}`,
                timestamp: new Date()
            });
        }
    }
}