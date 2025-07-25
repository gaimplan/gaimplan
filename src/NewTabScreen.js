/**
 * New Tab Screen component
 */
export class NewTabScreen {
    constructor(container) {
        this.container = container;
        this.render();
    }
    
    render() {
        this.container.innerHTML = `
            <div class="new-tab-screen">
                <div class="new-tab-content">
                    <h2>No file is open</h2>
                    
                    <div class="new-tab-actions">
                        <button class="new-tab-action" onclick="window.createNewNote()">
                            Create new note
                            <span class="new-tab-shortcut">⌘ N</span>
                        </button>
                        
                        <button class="new-tab-action secondary" onclick="window.closeCurrentTab()">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
}

// Global functions for new tab actions
window.createNewNote = async function() {
    // Use the existing new file modal
    if (window.showCreateFileModal) {
        window.showCreateFileModal('');
    }
};

window.closeCurrentTab = function() {
    if (!window.tabManager) return;
    
    const activeTab = window.tabManager.getActiveTab();
    if (activeTab) {
        window.tabManager.closeTab(activeTab.id);
    }
};