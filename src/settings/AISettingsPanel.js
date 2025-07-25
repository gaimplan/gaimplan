import { invoke } from '@tauri-apps/api/core';

export class AISettingsPanel {
    constructor() {
        this.state = {
            provider: 'openai',  // Track current provider
            endpoint: 'https://api.openai.com/v1',
            apiKey: '',
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 2000,
            streamingEnabled: true,
            systemPrompt: null,
            showApiKey: false,
            testing: false,
            testStatus: null,
            showAdvanced: false
        };
        
        this.container = null;
        this.callbacks = {
            onSave: null
        };
        this.activeProvider = null;  // Track the active provider
    }
    
    async mount(container, callbacks = {}) {
        console.log('Mounting AI Settings Panel');
        this.container = container;
        this.callbacks = { ...this.callbacks, ...callbacks };
        
        // Load the active provider
        await this.loadActiveProvider();
        await this.loadSettings();
        this.render();
    }
    
    async loadActiveProvider() {
        try {
            const activeProvider = await invoke('get_active_ai_provider');
            this.activeProvider = activeProvider;
            this.state.provider = activeProvider;
            console.log('Active AI provider:', activeProvider);
        } catch (error) {
            console.error('Failed to load active provider:', error);
            this.activeProvider = 'openai';
            this.state.provider = 'openai';
        }
    }
    
    async loadSettings() {
        try {
            const settings = await invoke('get_ai_settings');
            if (settings) {
                console.log('Loaded AI settings:', { ...settings, api_key: '***' });
                // Convert snake_case to camelCase for frontend use
                this.state = { 
                    ...this.state, 
                    provider: settings.provider || this.state.provider,
                    endpoint: settings.endpoint,
                    apiKey: settings.api_key || '',
                    model: settings.model,
                    temperature: settings.temperature,
                    maxTokens: settings.max_tokens,
                    streamingEnabled: settings.streaming_enabled !== undefined ? settings.streaming_enabled : true,
                    systemPrompt: settings.system_prompt || null
                };
            }
        } catch (error) {
            console.error('Failed to load AI settings:', error);
        }
    }
    
    async saveSettings() {
        try {
            const settings = {
                provider: this.state.provider,
                endpoint: this.state.endpoint,
                api_key: this.state.apiKey || null,
                model: this.state.model,
                temperature: this.state.temperature,
                max_tokens: this.state.maxTokens,
                streaming_enabled: true,  // Add missing field
                system_prompt: this.state.systemPrompt || null  // Save custom system prompt
            };
            
            console.log('Saving AI settings...');
            await invoke('save_ai_settings', { settings });
            
            // Update the active provider
            this.activeProvider = this.state.provider;
            
            this.showNotification('Settings saved successfully', 'success');
            
            // Call callback if provided
            if (this.callbacks.onSave) {
                this.callbacks.onSave(settings);
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings: ' + error, 'error');
        }
    }
    
    async testConnection() {
        this.state.testing = true;
        this.state.testStatus = null;
        this.render();
        
        try {
            const settings = {
                endpoint: this.state.endpoint,
                api_key: this.state.apiKey || null,
                model: this.state.model,
                temperature: this.state.temperature,
                max_tokens: this.state.maxTokens
            };
            
            console.log('Testing AI connection...');
            const result = await invoke('test_ai_connection', { settings });
            console.log('Connection test result:', result);
            
            this.state.testStatus = result;
        } catch (error) {
            console.error('Connection test failed:', error);
            this.state.testStatus = {
                overallStatus: {
                    success: false,
                    message: 'Test failed: ' + error
                }
            };
        } finally {
            this.state.testing = false;
            this.render();
        }
    }
    
    async quickSetup(provider) {
        console.log('Quick setup for:', provider);
        
        // Update current provider
        this.state.provider = provider;
        
        try {
            // Load saved settings for this provider
            const settings = await invoke('get_ai_settings_for_provider', { provider });
            console.log(`Loaded settings for ${provider}:`, { ...settings, api_key: '***' });
            
            // Update state with loaded settings
            this.state = {
                ...this.state,
                provider: settings.provider || provider,
                endpoint: settings.endpoint,
                apiKey: settings.api_key || '',
                model: settings.model,
                temperature: settings.temperature,
                maxTokens: settings.max_tokens,
                streamingEnabled: settings.streaming_enabled !== undefined ? settings.streaming_enabled : true,
                systemPrompt: settings.system_prompt || null
            };
        } catch (error) {
            console.error(`Failed to load settings for ${provider}:`, error);
            // If loading fails, use defaults
            this.setDefaultsForProvider(provider);
        }
        
        this.render();
    }
    
    setDefaultsForProvider(provider) {
        switch (provider) {
            case 'openai':
                this.state.endpoint = 'https://api.openai.com/v1';
                this.state.model = 'gpt-4';
                this.state.apiKey = '';
                this.state.temperature = 0.7;
                this.state.maxTokens = 4096;
                break;
            case 'gemini':
                this.state.endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/';
                this.state.model = 'gemini-2.0-flash';
                this.state.apiKey = '';
                this.state.temperature = 0.7;
                this.state.maxTokens = 8192;
                break;
            case 'ollama':
                this.state.endpoint = 'http://localhost:11434/v1';
                this.state.model = 'llama3.2';
                this.state.apiKey = '';
                this.state.temperature = 0.7;
                this.state.maxTokens = 4096;
                break;
            case 'lmstudio':
                this.state.endpoint = 'http://localhost:1234/v1';
                this.state.model = 'local-model';
                this.state.apiKey = '';
                this.state.temperature = 0.7;
                this.state.maxTokens = 4096;
                break;
        }
    }
    
    updateEndpoint(value) {
        this.state.endpoint = value;
    }
    
    updateApiKey(value) {
        this.state.apiKey = value;
    }
    
    updateModel(value) {
        this.state.model = value;
    }
    
    updateTemperature(value) {
        this.state.temperature = parseFloat(value);
    }
    
    updateMaxTokens(value) {
        this.state.maxTokens = parseInt(value);
    }
    
    updateSystemPrompt(value) {
        this.state.systemPrompt = value;
    }
    
    toggleApiKeyVisibility() {
        this.state.showApiKey = !this.state.showApiKey;
        this.render();
    }
    
    toggleAdvanced() {
        this.state.showAdvanced = !this.state.showAdvanced;
        this.render();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
    
    getModelExamples(endpoint) {
        if (endpoint.includes('openai.com')) {
            return 'Examples: gpt-4, gpt-3.5-turbo, gpt-4-turbo-preview';
        } else if (endpoint.includes('generativelanguage.googleapis.com')) {
            return 'Examples: gemini-2.0-flash, gemini-2.5-flash, gemini-1.5-pro';
        } else if (endpoint.includes('11434')) {
            return 'Examples: llama2, mistral, codellama';
        } else if (endpoint.includes('1234')) {
            return 'Examples: Use model name from LM Studio';
        }
        return 'Enter the model name for your AI provider';
    }
    
    render() {
        if (!this.container) return;
        
        // Make this instance available globally for event handlers
        window.aiSettingsPanel = this;
        
        this.container.innerHTML = `
            <div class="ai-settings-panel">
                <h2>AI Chat Settings</h2>
                
                <div class="quick-setup">
                    <p>Quick Setup:</p>
                    <div class="quick-setup-buttons">
                        <button onclick="aiSettingsPanel.quickSetup('openai')" 
                                class="quick-setup-btn ${this.state.provider === 'openai' ? 'selected' : ''} ${this.activeProvider === 'openai' ? 'active' : ''}">
                            <span class="provider-icon">🤖</span>
                            OpenAI
                            ${this.activeProvider === 'openai' ? '<span class="active-badge">✓</span>' : ''}
                        </button>
                        <button onclick="aiSettingsPanel.quickSetup('gemini')" 
                                class="quick-setup-btn ${this.state.provider === 'gemini' ? 'selected' : ''} ${this.activeProvider === 'gemini' ? 'active' : ''}">
                            <span class="provider-icon">💎</span>
                            Gemini
                            ${this.activeProvider === 'gemini' ? '<span class="active-badge">✓</span>' : ''}
                        </button>
                        <button onclick="aiSettingsPanel.quickSetup('ollama')" 
                                class="quick-setup-btn ${this.state.provider === 'ollama' ? 'selected' : ''} ${this.activeProvider === 'ollama' ? 'active' : ''}">
                            <span class="provider-icon">🦙</span>
                            Ollama
                            ${this.activeProvider === 'ollama' ? '<span class="active-badge">✓</span>' : ''}
                        </button>
                        <button onclick="aiSettingsPanel.quickSetup('lmstudio')" 
                                class="quick-setup-btn ${this.state.provider === 'lmstudio' ? 'selected' : ''} ${this.activeProvider === 'lmstudio' ? 'active' : ''}">
                            <span class="provider-icon">🖥️</span>
                            LM Studio
                            ${this.activeProvider === 'lmstudio' ? '<span class="active-badge">✓</span>' : ''}
                        </button>
                    </div>
                    <p class="quick-setup-info">
                        ${this.state.provider !== this.activeProvider ? 
                            `<span class="warning">⚠️ You're editing ${this.state.provider} settings. Click Save to make it active.</span>` : 
                            `<span class="info">Currently using ${this.activeProvider}</span>`}
                    </p>
                </div>
                
                <div class="settings-form">
                    <div class="form-group">
                        <label>API Endpoint:</label>
                        <input 
                            type="url" 
                            value="${this.state.endpoint}"
                            onchange="aiSettingsPanel.updateEndpoint(this.value)"
                            placeholder="https://api.openai.com/v1"
                            class="form-input"
                        />
                        <small>The base URL for your AI provider's API</small>
                    </div>
                    
                    <div class="form-group">
                        <label>API Key:</label>
                        <div class="api-key-input">
                            <input 
                                type="${this.state.showApiKey ? 'text' : 'password'}" 
                                value="${this.state.apiKey}"
                                onchange="aiSettingsPanel.updateApiKey(this.value)"
                                placeholder="sk-..."
                                class="form-input"
                            />
                            <button onclick="aiSettingsPanel.toggleApiKeyVisibility()" class="toggle-visibility-btn">
                                ${this.state.showApiKey ? '🙈' : '👁️'}
                            </button>
                        </div>
                        <small>Leave empty for local AI servers</small>
                    </div>
                    
                    <div class="form-group">
                        <label>Model Name:</label>
                        <input 
                            type="text" 
                            value="${this.state.model}"
                            onchange="aiSettingsPanel.updateModel(this.value)"
                            placeholder="gpt-4"
                            class="form-input"
                        />
                        <small>${this.getModelExamples(this.state.endpoint)}</small>
                    </div>
                    
                    <div class="form-group">
                        <label>System Prompt:</label>
                        <textarea 
                            value="${this.state.systemPrompt || 'You are a helpful AI assistant integrated into a note-taking app called gaimplan. You help users with their notes, writing, research, and questions. Always provide helpful, accurate, and relevant responses.'}"
                            onchange="aiSettingsPanel.updateSystemPrompt(this.value)"
                            placeholder="Enter custom system prompt..."
                            class="form-input"
                            rows="6"
                        >${this.state.systemPrompt || 'You are a helpful AI assistant integrated into a note-taking app called gaimplan. You help users with their notes, writing, research, and questions. Always provide helpful, accurate, and relevant responses.'}</textarea>
                        <small>This prompt will be used for all AI conversations. Dynamic content like MCP tools and tag context will be appended automatically.</small>
                    </div>
                    
                    <div class="advanced-section">
                        <button onclick="aiSettingsPanel.toggleAdvanced()" class="advanced-toggle">
                            ${this.state.showAdvanced ? '▼' : '▶'} Advanced Settings
                        </button>
                        
                        ${this.state.showAdvanced ? `
                            <div class="advanced-settings">
                                <div class="form-group">
                                    <label>Temperature: ${this.state.temperature}</label>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="2" 
                                        step="0.1"
                                        value="${this.state.temperature}"
                                        oninput="aiSettingsPanel.updateTemperature(this.value); this.previousElementSibling.textContent = 'Temperature: ' + this.value"
                                        class="form-slider"
                                    />
                                    <small>Controls randomness: 0 = focused, 2 = creative</small>
                                </div>
                                
                                <div class="form-group">
                                    <label>Max Tokens:</label>
                                    <input 
                                        type="number" 
                                        min="100" 
                                        max="8000" 
                                        value="${this.state.maxTokens}"
                                        onchange="aiSettingsPanel.updateMaxTokens(this.value)"
                                        class="form-input"
                                    />
                                    <small>Maximum response length in tokens</small>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="form-actions">
                        <button 
                            onclick="aiSettingsPanel.testConnection()"
                            class="test-btn ${this.state.testing ? 'testing' : ''}"
                            ${this.state.testing ? 'disabled' : ''}
                        >
                            ${this.state.testing ? 'Testing...' : 'Test Connection'}
                        </button>
                        <button onclick="aiSettingsPanel.saveSettings()" class="save-btn">
                            Save Settings
                        </button>
                    </div>
                    
                    ${this.state.testStatus ? this.renderTestStatus() : ''}
                    
                    <div class="mcp-section" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border-color);">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">MCP Integration</h3>
                                <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
                                    Configure Model Context Protocol servers for enhanced AI capabilities
                                </p>
                            </div>
                            <button onclick="console.log('MCP button clicked'); console.log('window.mcpSettings:', window.mcpSettings); window.mcpSettings?.show()" class="mcp-settings-btn" style="
                                background: var(--bg-secondary);
                                border: 1px solid var(--border-color);
                                padding: 8px 16px;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 13px;
                                display: flex;
                                align-items: center;
                                gap: 6px;
                                transition: all 0.2s;
                            " onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="this.style.background='var(--bg-secondary)'">
                                <span>🔧</span> MCP Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    renderTestStatus() {
        const status = this.state.testStatus;
        const overall = status.overall_status || status.overallStatus;
        
        if (!overall) return '';
        
        return `
            <div class="test-status ${overall.success ? 'success' : 'error'}">
                <div class="test-result">
                    <span class="status-icon">${overall.success ? '✓' : '✗'}</span>
                    <span class="status-message">${overall.message}</span>
                </div>
                
                ${status.endpoint_status ? `
                    <div class="test-detail">
                        <span class="detail-icon">${status.endpoint_status.success ? '✓' : '✗'}</span>
                        Endpoint: ${status.endpoint_status.message}
                    </div>
                ` : ''}
                
                ${status.auth_status ? `
                    <div class="test-detail">
                        <span class="detail-icon">${status.auth_status.success ? '✓' : '✗'}</span>
                        Authentication: ${status.auth_status.message}
                    </div>
                ` : ''}
                
                ${status.model_status ? `
                    <div class="test-detail">
                        <span class="detail-icon">${status.model_status.success ? '✓' : '✗'}</span>
                        Model: ${status.model_status.message}
                    </div>
                ` : ''}
            </div>
        `;
    }
}