export class TOCWidget {
    constructor() {
        console.log('[TOCWidget] Initializing Table of Contents widget');
        
        this.container = null;
        this.tocList = null;
        this.editor = null;
        this.headings = [];
        this.updateTimeout = null;
        this.activeHeadingId = null;
    }
    
    mount(containerElement) {
        console.log('[TOCWidget] Mounting widget');
        
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'toc-widget';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'toc-header';
        header.innerHTML = `
            <h3>Table of Contents</h3>
            <span class="toc-count">0 headings</span>
        `;
        
        // Create TOC list container
        this.tocList = document.createElement('div');
        this.tocList.className = 'toc-list';
        
        // Create empty state
        const emptyState = document.createElement('div');
        emptyState.className = 'toc-empty';
        emptyState.textContent = 'No headings found';
        this.tocList.appendChild(emptyState);
        
        // Assemble widget
        this.container.appendChild(header);
        this.container.appendChild(this.tocList);
        
        // Mount to parent
        containerElement.appendChild(this.container);
        
        // Update TOC if editor is already set
        if (this.editor) {
            this.updateTOC();
        }
    }
    
    updateEditor(editor) {
        console.log('[TOCWidget] Updating editor instance');
        
        // Clean up previous listener
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        
        this.editor = editor;
        
        if (!editor) {
            console.log('[TOCWidget] Editor removed, clearing TOC');
            this.clearTOC();
            return;
        }
        
        // Set up document change listener
        this.setupChangeListener();
        
        // Initial TOC update
        this.updateTOC();
    }
    
    setupChangeListener() {
        if (!this.editor || !this.editor.view) return;
        
        // Get the editor view
        const view = this.editor.view;
        
        console.log('[TOCWidget] Setting up change listener');
        
        // Store previous content to detect changes
        let previousContent = view.state.doc.toString();
        
        // Check for content changes periodically
        this.updateInterval = setInterval(() => {
            if (!this.editor || !this.editor.view) {
                clearInterval(this.updateInterval);
                return;
            }
            
            const currentContent = this.editor.view.state.doc.toString();
            if (currentContent !== previousContent) {
                console.log('[TOCWidget] Content changed, scheduling update');
                previousContent = currentContent;
                this.scheduleUpdate();
            }
        }, 1000);
        
        // Also update on focus
        view.dom.addEventListener('focus', () => this.scheduleUpdate());
    }
    
    scheduleUpdate() {
        // Debounce updates to avoid excessive processing
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        
        this.updateTimeout = setTimeout(() => {
            this.updateTOC();
        }, 300);
    }
    
    updateTOC() {
        if (!this.editor || !this.editor.view) {
            console.log('[TOCWidget] No editor available for TOC update');
            return;
        }
        
        console.log('[TOCWidget] Updating Table of Contents');
        
        // Get the document content
        const content = this.editor.view.state.doc.toString();
        
        // Extract headings
        this.headings = this.extractHeadings(content);
        
        // Update the UI
        this.renderTOC();
        
        // Update heading count
        const countEl = this.container.querySelector('.toc-count');
        if (countEl) {
            countEl.textContent = `${this.headings.length} heading${this.headings.length !== 1 ? 's' : ''}`;
        }
    }
    
    extractHeadings(content) {
        const headings = [];
        const lines = content.split('\n');
        let lineNumber = 1;
        let charPos = 0;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Match markdown headings (# to ######)
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                
                headings.push({
                    level,
                    text,
                    line: lineNumber,
                    position: charPos + match[1].length + 1, // Position after "# "
                    id: `heading-${lineNumber}-${level}`
                });
            }
            
            lineNumber++;
            charPos += line.length + 1; // +1 for newline
        }
        
        return headings;
    }
    
    renderTOC() {
        // Clear existing content
        this.tocList.innerHTML = '';
        
        if (this.headings.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'toc-empty';
            emptyState.textContent = 'No headings found';
            this.tocList.appendChild(emptyState);
            return;
        }
        
        // Create nested structure
        const tocTree = this.buildTOCTree(this.headings);
        const tocElement = this.renderTOCTree(tocTree);
        this.tocList.appendChild(tocElement);
    }
    
    buildTOCTree(headings) {
        const root = { children: [], level: 0 };
        const stack = [root];
        
        for (const heading of headings) {
            // Pop stack until we find the right parent
            while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) {
                stack.pop();
            }
            
            // Create node
            const node = {
                ...heading,
                children: []
            };
            
            // Add to parent's children
            stack[stack.length - 1].children.push(node);
            
            // Push to stack
            stack.push(node);
        }
        
        return root.children;
    }
    
    renderTOCTree(nodes, depth = 0) {
        const ul = document.createElement('ul');
        ul.className = `toc-level toc-level-${depth}`;
        
        for (const node of nodes) {
            const li = document.createElement('li');
            li.className = 'toc-item';
            
            // Create the heading link
            const link = document.createElement('a');
            link.className = `toc-link toc-link-h${node.level}`;
            link.href = '#';
            link.textContent = node.text;
            link.dataset.line = node.line;
            link.dataset.position = node.position;
            link.dataset.headingId = node.id;
            
            // Add click handler
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigateToHeading(node);
            });
            
            li.appendChild(link);
            
            // Render children if any
            if (node.children && node.children.length > 0) {
                const childList = this.renderTOCTree(node.children, depth + 1);
                li.appendChild(childList);
            }
            
            ul.appendChild(li);
        }
        
        return ul;
    }
    
    navigateToHeading(heading) {
        if (!this.editor || !this.editor.view) {
            console.log('[TOCWidget] No editor available for navigation');
            return;
        }
        
        console.log(`[TOCWidget] Navigating to heading: ${heading.text} at line ${heading.line}`);
        
        const view = this.editor.view;
        
        // Use the position we calculated during extraction
        const pos = heading.position;
        
        // Get the line information for better positioning
        const line = view.state.doc.lineAt(pos);
        
        // Position cursor at the start of the heading
        view.dispatch({
            selection: { anchor: line.from, head: line.from },
            scrollIntoView: true
        });
        
        // Additional scroll adjustment to position heading near top
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            const coords = view.coordsAtPos(line.from);
            if (coords) {
                // Get the editor's scroll container
                const scrollDOM = view.scrollDOM;
                const editorRect = scrollDOM.getBoundingClientRect();
                
                // Calculate where the line currently is relative to viewport
                const lineTop = coords.top - editorRect.top + scrollDOM.scrollTop;
                
                // Position the heading 80px from top (comfortable reading position)
                const targetScrollTop = lineTop - 80;
                
                // Smooth scroll to position
                scrollDOM.scrollTo({
                    top: Math.max(0, targetScrollTop),
                    behavior: 'smooth'
                });
            }
        });
        
        // Focus the editor
        view.focus();
        
        // Update active heading
        this.setActiveHeading(heading.id);
    }
    
    setActiveHeading(headingId) {
        // Remove previous active state
        const previousActive = this.tocList.querySelector('.toc-link.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }
        
        // Set new active state
        const newActive = this.tocList.querySelector(`[data-heading-id="${headingId}"]`);
        if (newActive) {
            newActive.classList.add('active');
            this.activeHeadingId = headingId;
        }
    }
    
    clearTOC() {
        this.headings = [];
        this.renderTOC();
        
        // Update heading count
        const countEl = this.container.querySelector('.toc-count');
        if (countEl) {
            countEl.textContent = '0 headings';
        }
    }
    
    getSettings() {
        // Return any widget-specific settings
        return {
            activeHeadingId: this.activeHeadingId
        };
    }
}