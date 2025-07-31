// VaultPicker.js - Vault selection dropdown component

import { invoke } from '@tauri-apps/api/core';
import windowContext from '../contexts/WindowContext.js';

export class VaultPicker {
    constructor(container) {
        this.container = container;
        this.recentVaults = [];
        this.isOpen = false;
        this.currentVault = null;
        
        this.init();
    }
    
    async init() {
        // Listen for vault changes
        windowContext.on('vault-opened', (vault) => {
            console.log('VaultPicker: Received vault-opened event', vault);
            this.currentVault = vault;
            this.render();
        });
        
        // Load recent vaults
        await this.loadRecentVaults();
        
        // Get current vault info
        this.currentVault = await windowContext.getVaultInfo();
        
        // Initial render
        this.render();
    }
    
    async loadRecentVaults() {
        try {
            this.recentVaults = await invoke('get_recent_vaults_basic') || [];
        } catch (error) {
            console.error('VaultPicker: Failed to load recent vaults', error);
            this.recentVaults = [];
        }
    }
    
    render() {
        this.container.innerHTML = `
            <div class="vault-picker">
                <button class="vault-picker-button" id="vault-picker-toggle">
                    <span class="vault-icon">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/>
                        </svg>
                    </span>
                    <span class="vault-name">
                        ${this.currentVault ? this.escapeHtml(this.currentVault.name) : 'No Vault'}
                    </span>
                    <span class="dropdown-arrow">▼</span>
                </button>
                <div class="vault-picker-menu ${this.isOpen ? 'open' : ''}" id="vault-picker-menu">
                    ${this.renderMenu()}
                </div>
            </div>
        `;
        
        // Add event listeners
        this.attachEventListeners();
    }
    
    renderMenu() {
        let menuHtml = '<div class="vault-picker-menu-inner">';
        
        // Recent vaults section - show only last 3
        if (this.recentVaults.length > 0) {
            menuHtml += '<div class="vault-picker-section">';
            menuHtml += '<div class="vault-picker-section-title">Recent Vaults</div>';
            
            // Limit to last 3 recent vaults
            const vaultsToShow = this.recentVaults.slice(0, 3);
            
            vaultsToShow.forEach(vault => {
                const isActive = this.currentVault?.path === vault.path;
                menuHtml += `
                    <div class="vault-picker-item ${isActive ? 'active' : ''}" 
                         data-action="open-vault" 
                         data-path="${this.escapeHtml(vault.path)}">
                        ${isActive ? '<span class="checkmark">✓</span>' : '<span class="spacer"></span>'}
                        <span class="vault-item-name">${this.escapeHtml(vault.name)}</span>
                        <span class="vault-item-path">${this.escapeHtml(this.shortenPath(vault.path))}</span>
                    </div>
                `;
            });
            
            menuHtml += '</div>';
        }
        
        // Actions section
        menuHtml += '<div class="vault-picker-section">';
        menuHtml += '<div class="vault-picker-divider"></div>';
        
        menuHtml += `
            <div class="vault-picker-item" data-action="open-folder">
                <span class="spacer"></span>
                <span class="vault-item-name">Open Vault...</span>
            </div>
            <div class="vault-picker-item" data-action="open-new-window">
                <span class="spacer"></span>
                <span class="vault-item-name">Open in New Window...</span>
            </div>
        `;
        
        
        menuHtml += '</div>';
        menuHtml += '</div>';
        
        return menuHtml;
    }
    
    attachEventListeners() {
        const button = document.getElementById('vault-picker-toggle');
        const menu = document.getElementById('vault-picker-menu');
        
        // Toggle menu
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });
        
        // Menu item clicks
        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.vault-picker-item');
            if (!item) return;
            
            e.stopPropagation();
            
            const action = item.dataset.action;
            const path = item.dataset.path;
            
            switch (action) {
                case 'open-vault':
                    await this.openVault(path, false);
                    break;
                case 'open-folder':
                    await this.openVaultPicker(false);
                    break;
                case 'open-new-window':
                    await this.openVaultPicker(true);
                    break;
                case 'manage-vaults':
                    await this.manageVaults();
                    break;
            }
            
            this.closeMenu();
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.closeMenu();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'O') {
                e.preventDefault();
                this.openVaultPicker(true);
            }
        });
    }
    
    toggleMenu() {
        this.isOpen = !this.isOpen;
        const menu = document.getElementById('vault-picker-menu');
        if (menu) {
            menu.classList.toggle('open', this.isOpen);
        }
    }
    
    closeMenu() {
        this.isOpen = false;
        const menu = document.getElementById('vault-picker-menu');
        if (menu) {
            menu.classList.remove('open');
        }
    }
    
    async openVault(path, inNewWindow) {
        try {
            if (inNewWindow) {
                await invoke('open_vault_in_new_window_basic', { vaultPath: path });
            } else {
                // Switch vault in current window
                await windowContext.switchVault(path);
            }
            
            // Reload recent vaults
            await this.loadRecentVaults();
        } catch (error) {
            console.error('VaultPicker: Failed to open vault', error);
            alert(`Failed to open vault: ${error.message || error}`);
        }
    }
    
    async openVaultPicker(inNewWindow) {
        try {
            // Use Tauri command instead of dialog plugin directly
            const selected = await invoke('select_folder_for_vault');
            
            if (selected) {
                await this.openVault(selected, inNewWindow);
            }
        } catch (error) {
            console.error('VaultPicker: Failed to open folder picker', error);
        }
    }
    
    async manageVaults() {
        try {
            await invoke('manage_vaults_basic');
        } catch (error) {
            console.error('VaultPicker: Failed to open vault manager', error);
        }
    }
    
    // Helper methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    shortenPath(path) {
        const parts = path.split(/[/\\]/);
        if (parts.length > 3) {
            return `.../${parts.slice(-2).join('/')}`;
        }
        return path;
    }
}

// Add styles
const style = document.createElement('style');
style.textContent = `
.vault-picker {
    position: relative;
    display: inline-block;
}

.vault-picker-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    color: var(--text-normal);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
}

.vault-picker-button:hover {
    background: var(--background-modifier-hover);
    border-color: var(--background-modifier-border-hover);
}

.vault-icon {
    display: flex;
    align-items: center;
    opacity: 0.8;
}

.vault-name {
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dropdown-arrow {
    font-size: 10px;
    opacity: 0.6;
    margin-left: 4px;
}

.vault-picker-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 280px;
    max-width: 400px;
    background: var(--background-primary);
    background-color: rgba(30, 30, 30, 0.98);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    opacity: 0;
    visibility: hidden;
    transform: translateY(-4px);
    transition: all 0.2s;
    z-index: 1000;
}

.vault-picker-menu.open {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.vault-picker-menu-inner {
    padding: 4px;
    background: rgba(30, 30, 30, 0.98);
    border-radius: 8px;
}

.vault-picker-section {
    margin: 4px 0;
}

.vault-picker-section-title {
    padding: 8px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
}

.vault-picker-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s;
}

.vault-picker-item:hover {
    background: rgba(255, 255, 255, 0.08);
}

.vault-picker-item.active {
    background: rgba(255, 255, 255, 0.12);
}

.checkmark, .spacer {
    width: 20px;
    flex-shrink: 0;
    text-align: center;
    color: var(--text-accent);
}

.vault-item-name {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vault-item-path {
    margin-left: 8px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.vault-picker-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 4px 0;
}
`;
document.head.appendChild(style);