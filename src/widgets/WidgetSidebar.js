import { invoke } from '@tauri-apps/api/core';
import { TOCWidget } from './TOCWidget.js';
import { CalendarWidget } from './CalendarWidget.js';

export class WidgetSidebar {
    constructor() {
        console.log('[WidgetSidebar] Initializing widget sidebar');
        
        this.container = null;
        this.tabBar = null;
        this.contentArea = null;
        this.resizeHandle = null;
        
        // State
        this.visible = false;
        this.activeTab = 'toc';
        this.width = 300; // Default width same as chat
        this.minWidth = 250;
        this.maxWidth = 600;
        
        // Widget instances
        this.widgets = new Map();
        
        // Resize state
        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
    }
    
    mount(parentElement) {
        console.log('[WidgetSidebar] Mounting to parent element');
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'widget-sidebar';
        
        // Create tab bar
        this.tabBar = document.createElement('div');
        this.tabBar.className = 'widget-tabs';
        
        // Create tabs
        const tocTab = this.createTab('toc', 'Table of Contents', true);
        const calendarTab = this.createTab('calendar', 'Calendar', false);
        
        this.tabBar.appendChild(tocTab);
        this.tabBar.appendChild(calendarTab);
        
        // Create content area
        this.contentArea = document.createElement('div');
        this.contentArea.className = 'widget-content';
        
        // Create resize handle
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'widget-resize-handle';
        this.resizeHandle.addEventListener('mousedown', this.handleResizeStart.bind(this));
        
        // Assemble container
        this.container.appendChild(this.tabBar);
        this.container.appendChild(this.contentArea);
        this.container.appendChild(this.resizeHandle);
        
        // Insert after editor container, before chat panel
        const editorContainer = parentElement.querySelector('.editor-container');
        const chatPanel = parentElement.querySelector('.right-sidebar');
        
        if (chatPanel && editorContainer) {
            // Insert between editor container and chat panel
            parentElement.insertBefore(this.container, chatPanel);
        } else if (editorContainer) {
            // Insert after editor container
            editorContainer.after(this.container);
        } else {
            console.error('[WidgetSidebar] Could not find proper insertion point');
            return;
        }
        
        // Initialize default widget
        this.setActiveTab(this.activeTab);
        
        // Load saved state after mounting
        // Use setTimeout to avoid race condition with initial toggle
        setTimeout(() => this.loadState(), 100);
    }
    
    createTab(id, label, isActive) {
        const tab = document.createElement('div');
        tab.className = `widget-tab ${isActive ? 'active' : ''}`;
        tab.dataset.tabId = id;
        tab.textContent = label;
        
        tab.addEventListener('click', () => {
            console.log(`[WidgetSidebar] Tab clicked: ${id}`);
            this.setActiveTab(id);
        });
        
        return tab;
    }
    
    setActiveTab(tabId) {
        console.log(`[WidgetSidebar] Setting active tab: ${tabId}`);
        
        // Update tab styling
        const tabs = this.tabBar.querySelectorAll('.widget-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tabId === tabId);
        });
        
        // Update active tab state
        this.activeTab = tabId;
        
        // Clear content area
        this.contentArea.innerHTML = '';
        
        // Mount appropriate widget
        const widget = this.getWidget(tabId);
        if (widget && widget.mount) {
            widget.mount(this.contentArea);
        } else {
            // Placeholder content
            const placeholder = document.createElement('div');
            placeholder.className = 'widget-placeholder';
            placeholder.textContent = `${tabId.toUpperCase()} widget coming soon...`;
            this.contentArea.appendChild(placeholder);
        }
        
        // Save state
        this.saveState();
    }
    
    getWidget(tabId) {
        // Return widget instance if already created
        if (this.widgets.has(tabId)) {
            return this.widgets.get(tabId);
        }
        
        // Create widget instance based on tab ID
        let widget = null;
        
        switch (tabId) {
            case 'toc':
                console.log('[WidgetSidebar] Creating TOC widget');
                widget = new TOCWidget();
                break;
            case 'calendar':
                console.log('[WidgetSidebar] Creating Calendar widget');
                widget = new CalendarWidget();
                break;
        }
        
        if (widget) {
            this.widgets.set(tabId, widget);
        }
        
        return widget;
    }
    
    toggle() {
        console.log('[WidgetSidebar] Toggling visibility');
        
        this.visible = !this.visible;
        
        if (this.visible) {
            this.show();
        } else {
            this.hide();
        }
        
        // Update button active state
        const widgetToggleBtn = document.querySelector('.widget-toggle-btn');
        if (widgetToggleBtn) {
            if (this.visible) {
                widgetToggleBtn.classList.add('active');
            } else {
                widgetToggleBtn.classList.remove('active');
            }
        } else {
            console.warn('[WidgetSidebar] Widget toggle button not found');
        }
        
        // Update layout
        this.updateLayout();
        
        // Save state
        this.saveState();
    }
    
    show() {
        console.log('[WidgetSidebar] Showing sidebar');
        this.container.classList.add('visible');
        this.visible = true;
    }
    
    hide() {
        console.log('[WidgetSidebar] Hiding sidebar');
        this.container.classList.remove('visible');
        this.visible = false;
    }
    
    updateLayout() {
        // The flexbox layout of app-container handles the layout automatically
        // We just need to ensure the width transition happens smoothly
        if (this.visible) {
            this.container.style.width = `${this.width}px`;
        } else {
            this.container.style.width = '0';
        }
        
        console.log('[WidgetSidebar] Layout updated:', {
            widgetVisible: this.visible,
            width: this.visible ? this.width : 0
        });
    }
    
    // Resize functionality
    handleResizeStart(e) {
        console.log('[WidgetSidebar] Starting resize');
        
        this.isResizing = true;
        this.startX = e.clientX;
        this.startWidth = this.width;
        
        // Add temporary event listeners
        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
        
        // Prevent text selection during resize
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'ew-resize';
        
        // Add resizing class for visual feedback
        this.container.classList.add('resizing');
    }
    
    handleResizeMove = (e) => {
        if (!this.isResizing) return;
        
        const deltaX = this.startX - e.clientX;
        const newWidth = Math.max(
            this.minWidth,
            Math.min(this.maxWidth, this.startWidth + deltaX)
        );
        
        this.width = newWidth;
        this.container.style.width = `${newWidth}px`;
    }
    
    handleResizeEnd = () => {
        console.log('[WidgetSidebar] Resize ended');
        
        this.isResizing = false;
        
        // Remove temporary event listeners
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);
        
        // Restore body styles
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        
        // Remove resizing class
        this.container.classList.remove('resizing');
        
        // Save new width
        this.saveState();
    }
    
    // State management
    async loadState() {
        try {
            if (!window.currentVaultPath) {
                console.log('[WidgetSidebar] No vault path available yet');
                return;
            }
            
            const settings = await invoke('get_widget_settings', {
                vaultPath: window.currentVaultPath
            });
            
            if (settings) {
                console.log('[WidgetSidebar] Loaded settings:', settings);
                
                this.visible = settings.visible || false;
                this.activeTab = settings.active_tab || 'toc';
                this.width = settings.width || 300;
                
                // Update UI based on loaded state
                if (this.container) {
                    this.container.style.width = this.visible ? `${this.width}px` : '0';
                }
                
                if (this.visible) {
                    this.show();
                    this.updateLayout();
                }
                
                // Update button active state based on loaded visibility
                const widgetToggleBtn = document.querySelector('.widget-toggle-btn');
                if (widgetToggleBtn) {
                    if (this.visible) {
                        widgetToggleBtn.classList.add('active');
                    } else {
                        widgetToggleBtn.classList.remove('active');
                    }
                }
            }
        } catch (error) {
            console.error('[WidgetSidebar] Error loading settings:', error);
        }
    }
    
    async saveState() {
        try {
            if (!window.currentVaultPath) {
                console.log('[WidgetSidebar] No vault path available');
                return;
            }
            
            const settings = {
                visible: this.visible,
                active_tab: this.activeTab,
                width: this.width,
                tab_settings: {}
            };
            
            // Collect widget-specific settings
            for (const [tabId, widget] of this.widgets) {
                if (widget.getSettings) {
                    settings.tab_settings[tabId] = widget.getSettings();
                }
            }
            
            console.log('[WidgetSidebar] Saving settings:', settings);
            await invoke('save_widget_settings', { 
                vaultPath: window.currentVaultPath,
                settings: settings 
            });
        } catch (error) {
            console.error('[WidgetSidebar] Error saving settings:', error);
        }
    }
    
    // Public API
    isVisible() {
        return this.visible;
    }
    
    getActiveTab() {
        return this.activeTab;
    }
    
    updateActiveEditor(editor) {
        // Pass editor updates to active widget
        const widget = this.getWidget(this.activeTab);
        if (widget && widget.updateEditor) {
            widget.updateEditor(editor);
        }
    }
    
    async saveWidgetSettings(widgetId, widgetSettings) {
        console.log(`[WidgetSidebar] Saving settings for widget: ${widgetId}`);
        
        try {
            if (!window.currentVaultPath) {
                console.log('[WidgetSidebar] No vault path available');
                return;
            }
            
            // Get current settings
            const currentSettings = await invoke('get_widget_settings', {
                vaultPath: window.currentVaultPath
            }) || {};
            
            // Update widget-specific settings
            if (!currentSettings.tab_settings) {
                currentSettings.tab_settings = {};
            }
            currentSettings.tab_settings[widgetId] = widgetSettings;
            
            // Save back
            await invoke('save_widget_settings', { 
                vaultPath: window.currentVaultPath,
                settings: currentSettings 
            });
            
            console.log(`[WidgetSidebar] Settings saved for ${widgetId}`);
        } catch (error) {
            console.error(`[WidgetSidebar] Failed to save settings for ${widgetId}:`, error);
            throw error;
        }
    }
}