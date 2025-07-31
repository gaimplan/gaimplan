import { MarkdownEditor } from './editor/markdown-editor.js';
import { PDFTab } from './pdf/PDFTab.js';

/**
 * TabManager handles multiple editor tabs with support for future split views
 */
export class TabManager {
    constructor(paneId = 'main') {
        this.tabs = new Map(); // tabId -> Tab object
        this.activeTabId = null;
        this.tabOrder = []; // Array of tabIds in display order
        this.maxTabs = 5;
        this.nextTabId = 1;
        
        // Future-proofing for split views
        this.panes = [{
            id: paneId,
            tabIds: [], // Tabs in this pane
            activeTabId: null
        }];
        
        this.listeners = {
            'tab-changed': [],
            'tab-closed': [],
            'tab-created': [],
            'tabs-reordered': [],
            'tab-navigated': []
        };
        
        // Register with window context if available
        if (window.windowContext) {
            window.windowContext.registerComponent('tabManager', this);
        }
    }
    
    /**
     * Create a new tab
     * @param {string} filePath - Path to the file (null for new untitled tab)
     * @param {string} content - Initial content
     * @param {boolean} isPDF - Whether this is a PDF file
     * @returns {string} tabId
     */
    createTab(filePath = null, content = '', isPDF = false) {
        if (this.tabs.size >= this.maxTabs) {
            throw new Error(`Maximum ${this.maxTabs} tabs allowed`);
        }
        
        const tabId = `tab-${this.nextTabId++}`;
        const editorContainer = document.createElement('div');
        editorContainer.className = 'tab-editor-container';
        editorContainer.style.display = 'none';
        editorContainer.dataset.tabId = tabId;
        
        let editor = null;
        let pdfTab = null;
        
        // Check if this is a PDF file
        if (isPDF || (filePath && filePath.toLowerCase().endsWith('.pdf'))) {
            console.log('Creating PDF tab for:', filePath);
            // For PDF files, create a PDFTab instance
            pdfTab = new PDFTab(filePath, this, this.panes[0].id);
            // Store reference for cleanup
            editorContainer.__pdfTabInstance = pdfTab;
            
            // Create PDF content asynchronously
            pdfTab.createContent().then(pdfContainer => {
                editorContainer.appendChild(pdfContainer);
            }).catch(error => {
                console.error('Error creating PDF tab:', error);
                editorContainer.innerHTML = `<div class="error-state">Error loading PDF: ${error.message}</div>`;
            });
        } else {
            // For regular files, create markdown editor
            editor = new MarkdownEditor(editorContainer);
        }
        
        const tab = {
            id: tabId,
            filePath,
            title: filePath ? filePath.split('/').pop() : 'Untitled',
            editor,
            pdfTab,
            editorContainer,
            isDirty: false,
            content: content,
            type: isPDF ? 'pdf' : 'markdown',
            navigationHistory: {
                history: filePath ? [filePath] : [],
                currentIndex: 0
            }
        };
        
        this.tabs.set(tabId, tab);
        this.tabOrder.push(tabId);
        this.panes[0].tabIds.push(tabId);
        
        // Only set content for markdown tabs
        if (!isPDF) {
            if (content) {
                editor.setContent(content);
                editor.currentFile = filePath;
            } else if (!filePath) {
                // Show new tab screen for untitled tabs
                import('./NewTabScreen.js').then(module => {
                    new module.NewTabScreen(editorContainer);
                });
            }
        }
        
        this.emit('tab-created', { tabId, tab });
        return tabId;
    }
    
    /**
     * Activate a tab
     * @param {string} tabId
     */
    activateTab(tabId) {
        if (!this.tabs.has(tabId)) {
            throw new Error(`Tab ${tabId} not found`);
        }
        
        const previousTabId = this.activeTabId;
        
        // Hide previous tab
        if (previousTabId && this.tabs.has(previousTabId)) {
            const prevTab = this.tabs.get(previousTabId);
            prevTab.editorContainer.style.display = 'none';
        }
        
        // Show new tab
        const tab = this.tabs.get(tabId);
        tab.editorContainer.style.display = 'block';
        
        this.activeTabId = tabId;
        this.panes[0].activeTabId = tabId;
        
        // Focus the editor or PDF viewer
        setTimeout(() => {
            if (tab.type === 'pdf' && tab.pdfTab) {
                tab.pdfTab.focus();
            } else if (tab.editor) {
                tab.editor.focus();
            }
        }, 0);
        
        this.emit('tab-changed', { tabId, previousTabId });
    }
    
    /**
     * Close a tab
     * @param {string} tabId
     * @param {boolean} force - Force close without checking for unsaved changes
     * @returns {boolean} Whether the tab was closed
     */
    async closeTab(tabId, force = false) {
        if (!this.tabs.has(tabId)) {
            return false;
        }
        
        const tab = this.tabs.get(tabId);
        
        // Check for unsaved changes
        if (!force && tab.isDirty && tab.filePath) {
            const confirmed = confirm(`"${tab.title}" has unsaved changes. Close anyway?`);
            if (!confirmed) {
                return false;
            }
        }
        
        // Clean up PDF tab if needed
        if (tab.type === 'pdf' && tab.pdfTab) {
            tab.pdfTab.destroy();
        }
        
        // Clean up markdown editor if needed
        if (tab.type === 'markdown' && tab.editor) {
            console.log('🧹 Destroying markdown editor for tab:', tabId);
            tab.editor.destroy();
        }
        
        // Remove from DOM
        tab.editorContainer.remove();
        
        // Remove from data structures
        this.tabs.delete(tabId);
        this.tabOrder = this.tabOrder.filter(id => id !== tabId);
        this.panes[0].tabIds = this.panes[0].tabIds.filter(id => id !== tabId);
        
        // If this was the active tab, activate another
        if (this.activeTabId === tabId) {
            const newActiveIndex = Math.max(0, this.tabOrder.indexOf(tabId) - 1);
            if (this.tabOrder.length > 0) {
                this.activateTab(this.tabOrder[newActiveIndex]);
            } else {
                this.activeTabId = null;
                this.panes[0].activeTabId = null;
            }
        }
        
        this.emit('tab-closed', { tabId });
        return true;
    }
    
    /**
     * Get the active tab
     * @returns {Object|null}
     */
    getActiveTab() {
        return this.activeTabId ? this.tabs.get(this.activeTabId) : null;
    }
    
    /**
     * Get all tabs in order
     * @returns {Array}
     */
    getTabs() {
        return this.tabOrder.map(id => this.tabs.get(id));
    }
    
    /**
     * Find tab by file path
     * @param {string} filePath
     * @returns {Object|null}
     */
    findTabByPath(filePath) {
        for (const tab of this.tabs.values()) {
            if (tab.filePath === filePath) {
                return tab;
            }
        }
        return null;
    }
    
    /**
     * Reorder tabs
     * @param {string} tabId - Tab to move
     * @param {number} newIndex - New position
     */
    reorderTabs(tabId, newIndex) {
        const oldIndex = this.tabOrder.indexOf(tabId);
        if (oldIndex === -1) return;
        
        this.tabOrder.splice(oldIndex, 1);
        this.tabOrder.splice(newIndex, 0, tabId);
        
        // Update pane tab order too
        const paneIndex = this.panes[0].tabIds.indexOf(tabId);
        if (paneIndex !== -1) {
            this.panes[0].tabIds.splice(paneIndex, 1);
            this.panes[0].tabIds.splice(newIndex, 0, tabId);
        }
        
        this.emit('tabs-reordered', { tabId, oldIndex, newIndex });
    }
    
    /**
     * Mark tab as dirty (has unsaved changes)
     * @param {string} tabId
     * @param {boolean} isDirty
     */
    setTabDirty(tabId, isDirty) {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.isDirty = isDirty;
        }
    }
    
    /**
     * Update tab title
     * @param {string} tabId
     * @param {string} title
     */
    updateTabTitle(tabId, title) {
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.title = title;
        }
    }
    
    /**
     * Add event listener
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event].push(callback);
        }
    }
    
    /**
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }
    
    /**
     * Emit event
     * @param {string} event
     * @param {Object} data
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => callback(data));
        }
    }
    
    /**
     * Find a tab by file path
     * @param {string} filePath
     * @returns {Object|null} Tab object or null
     */
    findTabByPath(filePath) {
        for (const [tabId, tab] of this.tabs) {
            if (tab.filePath === filePath) {
                return tab;
            }
        }
        return null;
    }
    
    /**
     * Open a file in a new tab
     * @param {string} filePath
     * @param {string} content - Content for non-PDF files
     * @returns {Promise<string>} tabId
     */
    async openFile(filePath, content = '') {
        // Check if it's a PDF
        const isPDF = filePath && filePath.toLowerCase().endsWith('.pdf');
        
        // Create the tab
        const tabId = this.createTab(filePath, content, isPDF);
        
        // Activate it
        this.activateTab(tabId);
        
        return tabId;
    }
    
    /**
     * Navigate to a file within a tab, managing history
     * @param {string} tabId - Tab to navigate in
     * @param {string} filePath - File path to navigate to
     * @param {boolean} isHistoryNavigation - Whether this is from back/forward
     */
    async navigateToFile(tabId, filePath, isHistoryNavigation = false) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        // If not a history navigation, update history
        if (!isHistoryNavigation) {
            const history = tab.navigationHistory;
            
            // If we're not at the end of history, truncate forward history
            if (history.currentIndex < history.history.length - 1) {
                history.history = history.history.slice(0, history.currentIndex + 1);
            }
            
            // Add new path if it's different from current
            if (history.history[history.currentIndex] !== filePath) {
                history.history.push(filePath);
                history.currentIndex = history.history.length - 1;
            }
        }
        
        // Update tab's current file path
        tab.filePath = filePath;
        tab.title = filePath.split('/').pop();
        
        // Emit navigation event for UI updates
        this.emit('tab-navigated', { tabId, filePath });
    }
    
    /**
     * Check if tab can go back in history
     * @param {string} tabId
     * @returns {boolean}
     */
    canGoBack(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return false;
        return tab.navigationHistory.currentIndex > 0;
    }
    
    /**
     * Check if tab can go forward in history
     * @param {string} tabId
     * @returns {boolean}
     */
    canGoForward(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return false;
        const history = tab.navigationHistory;
        return history.currentIndex < history.history.length - 1;
    }
    
    /**
     * Navigate back in tab history
     * @param {string} tabId
     * @returns {string|null} The file path navigated to
     */
    async goBack(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !this.canGoBack(tabId)) return null;
        
        const history = tab.navigationHistory;
        history.currentIndex--;
        const filePath = history.history[history.currentIndex];
        
        await this.navigateToFile(tabId, filePath, true);
        return filePath;
    }
    
    /**
     * Navigate forward in tab history
     * @param {string} tabId
     * @returns {string|null} The file path navigated to
     */
    async goForward(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !this.canGoForward(tabId)) return null;
        
        const history = tab.navigationHistory;
        history.currentIndex++;
        const filePath = history.history[history.currentIndex];
        
        await this.navigateToFile(tabId, filePath, true);
        return filePath;
    }
    
    /**
     * Get state for persistence
     * @returns {Object}
     */
    getState() {
        return {
            tabs: this.tabOrder.map(id => {
                const tab = this.tabs.get(id);
                return {
                    id: tab.id,
                    filePath: tab.filePath,
                    title: tab.title
                };
            }),
            activeTabId: this.activeTabId
        };
    }
    
    /**
     * Restore from saved state
     * @param {Object} state
     */
    async restoreState(state) {
        // Implementation for restoring tabs from saved state
        // Will be implemented when we add persistence
    }
    
    /**
     * Cleanup method for window shutdown
     */
    async cleanup() {
        console.log('🧹 Cleaning up TabManager');
        
        // Close all tabs
        const tabIds = [...this.tabs.keys()];
        for (const tabId of tabIds) {
            await this.closeTab(tabId, true);
        }
        
        // Clear listeners
        for (const event in this.listeners) {
            this.listeners[event] = [];
        }
        
        // Clear state
        this.tabs.clear();
        this.tabOrder = [];
        this.activeTabId = null;
    }
}