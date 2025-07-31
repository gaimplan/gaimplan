// WindowContext.js - Manages window-specific state and vault initialization

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';

class WindowContext {
    constructor() {
        this.windowId = null;
        this.vaultPath = null;
        this.vaultId = null;
        this.vaultName = null;
        this.isInitialized = false;
        this.listeners = new Map();
        this.components = new Map();
    }
    
    async initialize() {
        try {
            // Get window label from Tauri
            this.windowId = getCurrentWindow().label;
            console.log('WindowContext: Initializing window', this.windowId);
            
            // Listen for vault initialization event from backend
            const unlisten = await listen('init-vault', async (event) => {
                console.log('WindowContext: Received init-vault event', event.payload);
                await this.openVault(event.payload);
            });
            this.listeners.set('init-vault', unlisten);
            
            // Don't check initial vault here - let main.js do it after setting up listeners
            
            this.isInitialized = true;
            console.log('WindowContext: Initialization complete');
        } catch (error) {
            console.error('WindowContext: Failed to initialize', error);
            throw error;
        }
    }
    
    async checkInitialVault() {
        try {
            // Check URL parameters for vault path
            const urlParams = new URLSearchParams(window.location.search);
            const vaultPath = urlParams.get('vault');
            
            if (vaultPath) {
                console.log('WindowContext: Found vault in URL params', vaultPath);
                await this.openVault(vaultPath);
                return;
            }
            
            // Check if window has saved vault state
            const windowState = await invoke('get_window_state');
            if (windowState?.path) {
                console.log('WindowContext: Found vault in window state', windowState.path);
                await this.openVault(windowState.path);
            }
        } catch (error) {
            console.error('WindowContext: Error checking initial vault', error);
        }
    }
    
    async openVault(path) {
        try {
            console.log('WindowContext: Opening vault', path);
            
            // Open vault in backend for this window
            const vaultInfo = await invoke('open_vault', { 
                path
            });
            
            this.vaultPath = path;
            this.vaultId = vaultInfo.path; // Use path as ID for now
            this.vaultName = vaultInfo.name || path.split('/').pop() || path.split('\\').pop();
            
            // Update window title
            document.title = `Gaimplan - ${this.vaultName}`;
            await getCurrentWindow().setTitle(`Gaimplan - ${this.vaultName}`);
            
            // Initialize window-specific components
            await this.initializeComponents();
            
            // Automatically enable graph sync and sync vault name to Qdrant
            try {
                console.log('WindowContext: Automatically enabling graph sync for vault');
                await invoke('graph_enable_sync', { enabled: true });
                console.log('✅ Graph sync automatically enabled for vault');
                
                // Also sync vault name to Qdrant MCP server
                console.log('WindowContext: Automatically syncing vault name to Qdrant');
                const { mcpSettingsPanel } = await import('../mcp/MCPSettingsPanel.js');
                await mcpSettingsPanel.syncVaultNameForQdrant();
                console.log('✅ Vault name automatically synced to Qdrant');
            } catch (error) {
                console.error('⚠️ Failed to automatically enable graph sync or sync vault name:', error);
                // Continue even if sync fails - not critical for vault opening
            }
            
            // Emit vault opened event
            const vaultData = {
                path: this.vaultPath,
                id: this.vaultId,
                name: this.vaultName
            };
            console.log('WindowContext: Emitting vault-opened event', vaultData);
            this.emit('vault-opened', vaultData);
            
            console.log('WindowContext: Vault opened successfully', {
                path: this.vaultPath,
                id: this.vaultId,
                name: this.vaultName
            });
        } catch (error) {
            console.error('WindowContext: Failed to open vault', error);
            throw error;
        }
    }
    
    async initializeComponents() {
        // Components will register themselves with the window context
        console.log('WindowContext: Initializing window-specific components');
        
        // These will be initialized by main.js after vault is opened
        // - TabManager
        // - PaneManager
        // - EditorManager
        // - FileWatcher
        // - GraphSync (window-specific instance)
    }
    
    registerComponent(name, component) {
        console.log(`WindowContext: Registering component ${name}`);
        this.components.set(name, component);
    }
    
    getComponent(name) {
        return this.components.get(name);
    }
    
    // Event emitter functionality
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
        console.log(`WindowContext: Registered listener for '${event}', total listeners:`, this.listeners.get(event).length);
    }
    
    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(event, data) {
        const callbacks = this.listeners.get(event);
        console.log(`WindowContext: Emitting '${event}' to ${callbacks ? callbacks.length : 0} listeners`);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }
    
    // Cleanup method
    async cleanup() {
        console.log('WindowContext: Cleaning up');
        
        // Note: We don't clear the listeners here because they are
        // for our custom events (vault-opened, etc.) not Tauri events
        // The listeners should persist across vault switches
        
        // Clean up components
        for (const [name, component] of this.components) {
            if (component.cleanup && typeof component.cleanup === 'function') {
                await component.cleanup();
            }
        }
        this.components.clear();
        
        // Notify backend that window is closing
        if (this.windowId) {
            try {
                await invoke('window_closing');
            } catch (error) {
                console.error('WindowContext: Error notifying window close', error);
            }
        }
    }
    
    // Helper methods
    get hasVault() {
        return !!this.vaultPath;
    }
    
    async switchVault(newPath) {
        console.log('WindowContext: Switching vault', newPath);
        
        // Clean up current vault
        await this.cleanup();
        
        // Open new vault
        await this.openVault(newPath);
    }
    
    async getVaultInfo() {
        if (!this.hasVault) {
            return null;
        }
        
        return {
            path: this.vaultPath,
            id: this.vaultId,
            name: this.vaultName,
            windowId: this.windowId
        };
    }
}

// Create and export singleton instance
const windowContext = new WindowContext();

// Initialize on module load
if (typeof window !== 'undefined') {
    window.windowContext = windowContext;
    
    // Set up cleanup on window unload
    window.addEventListener('beforeunload', async (event) => {
        await windowContext.cleanup();
    });
}

export default windowContext;