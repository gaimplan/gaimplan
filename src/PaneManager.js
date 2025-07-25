import { TabManager } from './TabManager.js';
import { TabBar } from './TabBar.js';

/**
 * PaneManager handles split view functionality with up to 2 panes
 */
export class PaneManager {
    constructor() {
        console.log('🔲 Initializing PaneManager');
        
        // State
        this.panes = new Map(); // paneId -> pane object
        this.activePaneId = null;
        this.isSplit = false;
        
        // DOM references
        this.container = null;
        this.paneContainer = null;
        this.divider = null;
        
        // Event listeners
        this.listeners = {
            'pane-activated': [],
            'split-created': [],
            'split-removed': []
        };
        
        // Initialize with single pane
        this.initializeSinglePane();
    }
    
    /**
     * Initialize with a single pane
     */
    initializeSinglePane() {
        console.log('📋 Creating initial single pane');
        
        // Create container structure
        this.container = document.createElement('div');
        this.container.className = 'pane-manager-container';
        
        this.paneContainer = document.createElement('div');
        this.paneContainer.className = 'pane-container';
        this.container.appendChild(this.paneContainer);
        
        // Create first pane
        const paneId = 'pane-1';
        const firstPane = this.createPane(paneId);
        this.activePaneId = paneId;
        
        // Set up event listeners for the first pane
        this.setupPaneTabListeners(firstPane);
    }
    
    /**
     * Create a new pane
     * @param {string} paneId
     * @returns {Object} pane object
     */
    createPane(paneId) {
        console.log(`📄 Creating pane: ${paneId}`);
        
        // Create pane DOM structure
        const paneElement = document.createElement('div');
        paneElement.className = 'pane';
        paneElement.dataset.paneId = paneId;
        
        // Create tab bar container
        const tabBarContainer = document.createElement('div');
        tabBarContainer.className = 'pane-tab-bar';
        paneElement.appendChild(tabBarContainer);
        
        // Create editor wrapper
        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'pane-editor-wrapper';
        paneElement.appendChild(editorWrapper);
        
        // Create TabManager and TabBar for this pane
        const tabManager = new TabManager(paneId);
        const tabBar = new TabBar(tabManager, tabBarContainer);
        
        // Listen for tab creation to attach editors to this pane's wrapper
        tabManager.on('tab-created', ({ tab }) => {
            console.log(`📎 Attaching tab ${tab.id} to pane ${paneId}`);
            editorWrapper.appendChild(tab.editorContainer);
        });
        
        // Create pane object
        const pane = {
            id: paneId,
            element: paneElement,
            tabManager,
            tabBar,
            editorWrapper,
            tabBarContainer
        };
        
        this.panes.set(paneId, pane);
        this.paneContainer.appendChild(paneElement);
        
        // Add click handler to activate pane
        paneElement.addEventListener('click', () => {
            this.activatePane(paneId);
        });
        
        return pane;
    }
    
    /**
     * Split the view into two panes
     */
    split() {
        if (this.isSplit) {
            console.log('⚠️ View already split');
            return;
        }
        
        console.log('✂️ Splitting view');
        
        // Add split class for styling
        this.paneContainer.classList.add('split');
        
        // Create divider
        this.divider = document.createElement('div');
        this.divider.className = 'pane-divider';
        
        // Create second pane
        const secondPaneId = 'pane-2';
        const secondPane = this.createPane(secondPaneId);
        
        // Insert divider before second pane
        this.paneContainer.insertBefore(this.divider, secondPane.element);
        
        // Set up resizable divider
        this.setupResizableDivider();
        
        // Set up event listeners for the second pane's TabManager
        this.setupPaneTabListeners(secondPane);
        
        // Create initial tab in second pane
        const newTabId = secondPane.tabManager.createTab(null, '');
        
        // Activate the tab
        secondPane.tabManager.activateTab(newTabId);
        
        // Activate the second pane
        this.activatePane(secondPaneId);
        
        this.isSplit = true;
        this.emit('split-created', { paneId: secondPaneId });
    }
    
    /**
     * Set up tab event listeners for a pane
     * @param {Object} pane
     */
    setupPaneTabListeners(pane) {
        const tabManager = pane.tabManager;
        
        // Listen for tab changes
        tabManager.on('tab-changed', ({ tabId }) => {
            const tab = tabManager.getActiveTab();
            if (tab && tab.editor) {
                // Update global references if this is the active pane
                if (this.activePaneId === pane.id) {
                    window.currentEditor = tab.editor;
                    window.currentFile = tab.filePath;
                    // Update word count
                    if (window.updateWordCount) {
                        window.updateWordCount();
                    }
                }
            }
        });
        
        // Listen for tab creation
        tabManager.on('tab-created', ({ tabId, tab }) => {
            if (tab.editor) {
                // Apply theme if available
                const themeManager = window.currentThemeManager;
                if (themeManager && this.activePaneId === pane.id) {
                    themeManager.setEditor(tab.editor);
                }
            }
        });
    }
    
    /**
     * Remove split and return to single pane
     */
    unsplit() {
        if (!this.isSplit) {
            console.log('⚠️ View not split');
            return;
        }
        
        console.log('🔗 Removing split');
        
        const secondPane = this.panes.get('pane-2');
        if (secondPane) {
            // Check for unsaved changes
            const hasUnsavedChanges = Array.from(secondPane.tabManager.tabs.values())
                .some(tab => tab.isDirty);
            
            if (hasUnsavedChanges) {
                const confirmed = confirm('The second pane has unsaved changes. Close anyway?');
                if (!confirmed) return;
            }
            
            // Remove second pane
            secondPane.element.remove();
            this.panes.delete('pane-2');
            
            // Remove divider
            if (this.divider) {
                this.divider.remove();
                this.divider = null;
            }
            
            // Remove split class
            this.paneContainer.classList.remove('split');
            
            // Activate first pane
            this.activatePane('pane-1');
            
            this.isSplit = false;
            this.emit('split-removed', {});
        }
    }
    
    /**
     * Set up resizable divider functionality
     */
    setupResizableDivider() {
        let isResizing = false;
        let startX = 0;
        let startWidths = [];
        
        const pane1 = this.panes.get('pane-1').element;
        const pane2 = this.panes.get('pane-2').element;
        
        this.divider.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidths = [pane1.offsetWidth, pane2.offsetWidth];
            
            // Add resizing class for visual feedback
            document.body.style.cursor = 'col-resize';
            this.divider.classList.add('resizing');
            
            // Prevent text selection while dragging
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const deltaX = e.clientX - startX;
            const containerWidth = this.paneContainer.offsetWidth;
            const dividerWidth = this.divider.offsetWidth;
            
            // Calculate new widths
            const newWidth1 = startWidths[0] + deltaX;
            const newWidth2 = startWidths[1] - deltaX;
            
            // Set minimum pane width (200px)
            const minPaneWidth = 200;
            
            if (newWidth1 >= minPaneWidth && newWidth2 >= minPaneWidth) {
                // Calculate percentages
                const availableWidth = containerWidth - dividerWidth;
                const percent1 = (newWidth1 / availableWidth) * 100;
                const percent2 = (newWidth2 / availableWidth) * 100;
                
                // Apply new widths
                pane1.style.flex = `0 0 ${percent1}%`;
                pane2.style.flex = `0 0 ${percent2}%`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                this.divider.classList.remove('resizing');
            }
        });
    }
    
    /**
     * Activate a pane
     * @param {string} paneId
     */
    activatePane(paneId) {
        if (!this.panes.has(paneId)) {
            console.error(`❌ Pane ${paneId} not found`);
            return;
        }
        
        console.log(`🎯 Activating pane: ${paneId}`);
        
        // Remove active class from all panes
        this.panes.forEach(pane => {
            pane.element.classList.remove('active');
        });
        
        // Add active class to selected pane
        const pane = this.panes.get(paneId);
        pane.element.classList.add('active');
        
        this.activePaneId = paneId;
        
        // Update current editor if the pane has an active tab
        const activeTab = pane.tabManager.getActiveTab();
        if (activeTab && activeTab.editor) {
            window.currentEditor = activeTab.editor;
            window.currentFile = activeTab.filePath;
            // Update word count
            if (window.updateWordCount) {
                window.updateWordCount();
            }
            // Focus the editor
            setTimeout(() => {
                activeTab.editor.focus();
            }, 0);
        }
        
        this.emit('pane-activated', { paneId });
    }
    
    /**
     * Get the active pane's TabManager
     * @returns {TabManager|null}
     */
    getActiveTabManager() {
        if (!this.activePaneId) return null;
        const pane = this.panes.get(this.activePaneId);
        return pane ? pane.tabManager : null;
    }
    
    /**
     * Find which pane contains a tab with the given file path
     * @param {string} filePath
     * @returns {Object|null} pane object
     */
    findPaneByFilePath(filePath) {
        for (const pane of this.panes.values()) {
            const tab = pane.tabManager.findTabByPath(filePath);
            if (tab) {
                return pane;
            }
        }
        return null;
    }
    
    /**
     * Get a specific pane's TabManager
     * @param {string} paneId
     * @returns {TabManager|null}
     */
    getTabManager(paneId) {
        const pane = this.panes.get(paneId);
        return pane ? pane.tabManager : null;
    }
    
    /**
     * Get the number of panes
     * @returns {number}
     */
    getPaneCount() {
        return this.panes.size;
    }
    
    /**
     * Mount the PaneManager to a DOM element
     * @param {HTMLElement} parentElement
     */
    mount(parentElement) {
        console.log('🔧 Mounting PaneManager');
        parentElement.appendChild(this.container);
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
}