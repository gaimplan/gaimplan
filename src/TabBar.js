import { NewTabScreen } from './NewTabScreen.js';

/**
 * TabBar UI component for managing editor tabs
 */
export class TabBar {
    constructor(tabManager, container) {
        this.tabManager = tabManager;
        this.container = container;
        this.tabElements = new Map(); // tabId -> DOM element
        
        this.draggedTab = null;
        this.draggedIndex = null;
        
        this.init();
        this.bindEvents();
    }
    
    init() {
        // Create tab bar structure
        this.container.innerHTML = `
            <div class="tab-bar">
                <div class="tab-list" id="tab-list"></div>
                <button class="highlights-summary-button" id="highlights-summary-button" title="Generate Highlights Summary (Cmd+Shift+H)" style="display: none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                    </svg>
                </button>
                <button class="copy-text-button" id="copy-text-button" title="Copy All Text" style="display: none;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="tab-add-button" id="tab-add-button" title="New Tab">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 1V11M1 6H11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
        
        this.tabList = this.container.querySelector('#tab-list');
        this.addButton = this.container.querySelector('#tab-add-button');
        this.highlightsButton = this.container.querySelector('#highlights-summary-button');
        this.copyButton = this.container.querySelector('#copy-text-button');
    }
    
    bindEvents() {
        // Tab manager events
        this.tabManager.on('tab-created', ({ tabId, tab }) => {
            this.addTabElement(tabId, tab);
        });
        
        this.tabManager.on('tab-closed', ({ tabId }) => {
            this.removeTabElement(tabId);
        });
        
        this.tabManager.on('tab-changed', ({ tabId }) => {
            this.setActiveTab(tabId);
        });
        
        this.tabManager.on('tabs-reordered', () => {
            this.reorderTabElements();
        });
        
        // Add button click
        this.addButton.addEventListener('click', () => {
            this.handleNewTab();
        });
        
        // Highlights button click
        this.highlightsButton.addEventListener('click', () => {
            if (window.generateHighlightsSummary) {
                window.generateHighlightsSummary();
            }
        });
        
        // Copy button click
        this.copyButton.addEventListener('click', () => {
            if (window.copyAllText) {
                window.copyAllText();
            }
        });
        
        // Tab list drag events for reordering
        this.tabList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(e.clientX);
            const dragged = document.querySelector('.dragging');
            if (afterElement == null) {
                this.tabList.appendChild(dragged);
            } else {
                this.tabList.insertBefore(dragged, afterElement);
            }
        });
    }
    
    addTabElement(tabId, tab) {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        tabElement.draggable = true;
        
        tabElement.innerHTML = `
            <span class="tab-title">${this.escapeHtml(tab.title)}</span>
            <button class="tab-close" title="Close">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L7 7M1 7L7 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </button>
        `;
        
        // Click to activate
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.tabManager.activateTab(tabId);
            }
        });
        
        // Close button
        const closeButton = tabElement.querySelector('.tab-close');
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.tabManager.closeTab(tabId);
        });
        
        // Drag events
        tabElement.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            tabElement.classList.add('dragging');
            this.draggedTab = tabId;
            this.draggedIndex = Array.from(this.tabList.children).indexOf(tabElement);
        });
        
        tabElement.addEventListener('dragend', (e) => {
            tabElement.classList.remove('dragging');
            const newIndex = Array.from(this.tabList.children).indexOf(tabElement);
            if (this.draggedIndex !== newIndex) {
                this.tabManager.reorderTabs(this.draggedTab, newIndex);
            }
            this.draggedTab = null;
            this.draggedIndex = null;
        });
        
        this.tabList.appendChild(tabElement);
        this.tabElements.set(tabId, tabElement);
        
        // Update dirty indicator
        this.updateTabDirtyState(tabId, tab.isDirty);
    }
    
    removeTabElement(tabId) {
        const element = this.tabElements.get(tabId);
        if (element) {
            element.remove();
            this.tabElements.delete(tabId);
        }
    }
    
    setActiveTab(tabId) {
        // Remove active class from all tabs
        this.tabElements.forEach(element => {
            element.classList.remove('active');
        });
        
        // Add active class to current tab
        const activeElement = this.tabElements.get(tabId);
        if (activeElement) {
            activeElement.classList.add('active');
        }
        
        // Update highlights button visibility
        this.updateHighlightsButtonVisibility(tabId);
    }
    
    updateHighlightsButtonVisibility(tabId) {
        const tabs = this.tabManager.getTabs();
        const tab = tabs.find(t => t.id === tabId);
        
        // Show highlights and copy buttons only for markdown files
        if (tab && tab.filePath && tab.filePath.endsWith('.md')) {
            this.highlightsButton.style.display = 'flex';
            this.copyButton.style.display = 'flex';
        } else {
            this.highlightsButton.style.display = 'none';
            this.copyButton.style.display = 'none';
        }
    }
    
    updateTabTitle(tabId, title) {
        const element = this.tabElements.get(tabId);
        if (element) {
            const titleSpan = element.querySelector('.tab-title');
            titleSpan.textContent = title;
        }
    }
    
    updateTabDirtyState(tabId, isDirty) {
        const element = this.tabElements.get(tabId);
        if (element) {
            if (isDirty) {
                element.classList.add('dirty');
            } else {
                element.classList.remove('dirty');
            }
        }
    }
    
    reorderTabElements() {
        // Clear and re-add all tabs in the correct order
        this.tabList.innerHTML = '';
        const tabs = this.tabManager.getTabs();
        tabs.forEach(tab => {
            const element = this.tabElements.get(tab.id);
            if (element) {
                this.tabList.appendChild(element);
            }
        });
    }
    
    getDragAfterElement(x) {
        const draggableElements = [...this.tabList.querySelectorAll('.tab:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = x - box.left - box.width / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    handleNewTab() {
        if (this.tabManager.tabs.size >= this.tabManager.maxTabs) {
            alert(`Maximum ${this.tabManager.maxTabs} tabs allowed`);
            return;
        }
        
        const tabId = this.tabManager.createTab();
        this.tabManager.activateTab(tabId);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}