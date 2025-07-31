// PDFTab.js: Integration with the existing tab system for PDF viewing
// Creates PDF viewer instances that work seamlessly with TabManager

import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { basename } from '@tauri-apps/api/path';
import { 
  loadPDF, 
  renderAllPages, 
  zoomIn, 
  zoomOut,
  getCurrentScale,
  getCurrentPDF,
  getHighlights
} from './PDFViewer.js';
import { 
  initHighlightManager,
  loadHighlights,
  saveHighlights,
  extractHighlightsToMarkdown
} from './PDFHighlightManager.js';
import windowContext from '../contexts/WindowContext.js';

// Import CSS for PDF viewer
import './pdf-viewer.css';

/**
 * PDFTab class - Represents a PDF viewer tab
 */
export class PDFTab {
  constructor(pdfPath, tabManager, paneId) {
    console.log(`Creating PDF tab for: ${pdfPath}`);
    
    this.pdfPath = pdfPath;
    this.tabManager = tabManager;
    this.paneId = paneId;
    this.container = null;
    this.toolbar = null;
    this.viewerContainer = null;
    this.pageCounter = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.fileName = '';
  }
  
  /**
   * Create and return the tab content
   * @returns {Promise<HTMLElement>} The container element for the PDF viewer
   */
  async createContent() {
    // Create main container
    this.container = document.createElement('div');
    this.container.className = 'pdf-container';
    this.container.id = `pdf-container-${Date.now()}`;
    
    // Get filename for display
    this.fileName = await basename(this.pdfPath);
    
    // Create toolbar
    this.toolbar = this.createToolbar();
    this.container.appendChild(this.toolbar);
    
    // Create viewer container
    this.viewerContainer = document.createElement('div');
    this.viewerContainer.className = 'pdf-viewer';
    this.container.appendChild(this.viewerContainer);
    
    // Initialize PDF
    await this.initializePDF();
    
    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();
    
    return this.container;
  }
  
  /**
   * Create the toolbar matching editor header style
   * @returns {HTMLElement} Toolbar element
   */
  createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-header pdf-toolbar';
    
    toolbar.innerHTML = `
      <div class="editor-header-left">
        <button class="editor-control-btn pdf-prev-btn" title="Previous Page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <span class="pdf-page-counter">Page 1 / -</span>
        <button class="editor-control-btn pdf-next-btn" title="Next Page">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      
      <div class="editor-header-center pdf-toolbar-center">
        <span class="pdf-filename">${this.fileName}</span>
        <div class="pdf-zoom-controls">
          <button class="editor-control-btn pdf-zoom-out-btn" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
          <span class="pdf-zoom-level">${Math.round(getCurrentScale() * 100)}%</span>
          <button class="editor-control-btn pdf-zoom-in-btn" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="11" y1="8" x2="11" y2="14"></line>
              <line x1="8" y1="11" x2="14" y2="11"></line>
            </svg>
          </button>
        </div>
        <div class="editor-header-separator"></div>
        <button class="editor-control-btn pdf-highlight-btn" title="Highlight Selection (Cmd+Shift+H)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            <line x1="10" y1="11" x2="14" y2="15"></line>
          </svg>
        </button>
        <button class="editor-control-btn pdf-undo-btn" title="Undo (Cmd+Z)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"></path>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
          </svg>
        </button>
        <button class="editor-control-btn pdf-redo-btn" title="Redo (Cmd+Shift+Z)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 7v6h-6"></path>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
          </svg>
        </button>
        <button class="editor-control-btn pdf-extract-btn" title="Extract Highlights (Cmd+Shift+E)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="12" y1="18" x2="12" y2="12"></line>
            <line x1="9" y1="15" x2="15" y2="15"></line>
          </svg>
        </button>
        <button class="editor-control-btn pdf-clear-highlights-btn" title="Clear All Highlights">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <span class="pdf-highlight-count">0 highlights</span>
      </div>
      
      <div class="editor-header-right">
      </div>
    `;
    
    // Cache frequently used elements
    this.pageCounter = toolbar.querySelector('.pdf-page-counter');
    this.highlightCounter = toolbar.querySelector('.pdf-highlight-count');
    
    // Bind event handlers
    toolbar.querySelector('.pdf-prev-btn').addEventListener('click', () => this.previousPage());
    toolbar.querySelector('.pdf-next-btn').addEventListener('click', () => this.nextPage());
    toolbar.querySelector('.pdf-zoom-out-btn').addEventListener('click', () => this.handleZoomOut());
    toolbar.querySelector('.pdf-zoom-in-btn').addEventListener('click', () => this.handleZoomIn());
    toolbar.querySelector('.pdf-highlight-btn').addEventListener('click', () => this.highlightSelection());
    toolbar.querySelector('.pdf-undo-btn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('pdf-undo-highlight')));
    toolbar.querySelector('.pdf-redo-btn').addEventListener('click', () => window.dispatchEvent(new CustomEvent('pdf-redo-highlight')));
    toolbar.querySelector('.pdf-extract-btn').addEventListener('click', () => this.extractHighlights());
    toolbar.querySelector('.pdf-clear-highlights-btn').addEventListener('click', () => this.clearAllHighlights());
    
    return toolbar;
  }
  
  /**
   * Initialize PDF loading and rendering
   */
  async initializePDF() {
    try {
      // Get the vault path from the WindowContext
      const vaultPath = windowContext.vaultPath || '';
      
      // Construct the full path
      const fullPath = vaultPath ? 
        `${vaultPath}/${this.pdfPath}` : 
        this.pdfPath;
      
      // Convert file path for Tauri
      const assetUrl = convertFileSrc(fullPath);
      console.log(`Original PDF path: ${this.pdfPath}`);
      console.log(`Vault path: ${vaultPath}`);
      console.log(`Full PDF path: ${fullPath}`);
      console.log(`Loading PDF from Tauri URL: ${assetUrl}`);
      
      // Skip fetch test as it causes CORS issues with asset:// protocol
      
      // Load PDF - pass both URL and file path for Tauri file reading
      this.totalPages = await loadPDF(assetUrl, fullPath);
      this.updatePageCounter();
      
      // Load existing highlights
      await loadHighlights(this.pdfPath);
      
      // Render all pages
      await renderAllPages(this.viewerContainer);
      
      // Initialize highlight manager
      initHighlightManager(this.viewerContainer, this.pdfPath);
      
      // Update highlight count after loading
      this.updateHighlightCount();
      
      // Scroll to top
      this.viewerContainer.scrollTop = 0;
      
      console.log('PDF initialized successfully');
    } catch (error) {
      console.error('Error initializing PDF:', error);
      this.viewerContainer.innerHTML = `
        <div class="pdf-error">
          <p>Error loading PDF: ${error.message}</p>
        </div>
      `;
    }
  }
  
  /**
   * Navigate to previous page
   */
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollToPage(this.currentPage);
      this.updatePageCounter();
    }
  }
  
  /**
   * Navigate to next page
   */
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollToPage(this.currentPage);
      this.updatePageCounter();
    }
  }
  
  /**
   * Scroll to a specific page
   * @param {number} pageNum - Page number to scroll to
   */
  scrollToPage(pageNum) {
    const pageElement = this.viewerContainer.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  
  /**
   * Update page counter display
   */
  updatePageCounter() {
    if (this.pageCounter) {
      this.pageCounter.textContent = `Page ${this.currentPage} / ${this.totalPages}`;
    }
  }
  
  /**
   * Handle zoom in
   */
  async handleZoomIn() {
    const scrollRatio = this.viewerContainer.scrollTop / this.viewerContainer.scrollHeight;
    await zoomIn(this.viewerContainer);
    this.updateZoomLevel();
    // Restore scroll position proportionally
    this.viewerContainer.scrollTop = scrollRatio * this.viewerContainer.scrollHeight;
  }
  
  /**
   * Handle zoom out
   */
  async handleZoomOut() {
    const scrollRatio = this.viewerContainer.scrollTop / this.viewerContainer.scrollHeight;
    await zoomOut(this.viewerContainer);
    this.updateZoomLevel();
    // Restore scroll position proportionally
    this.viewerContainer.scrollTop = scrollRatio * this.viewerContainer.scrollHeight;
  }
  
  /**
   * Update zoom level display
   */
  updateZoomLevel() {
    const zoomElement = this.toolbar.querySelector('.pdf-zoom-level');
    if (zoomElement) {
      zoomElement.textContent = `${Math.round(getCurrentScale() * 100)}%`;
    }
  }
  
  /**
   * Highlight the current text selection
   */
  highlightSelection() {
    window.dispatchEvent(new CustomEvent('pdf-highlight-selection'));
  }
  
  /**
   * Update the highlight count display
   */
  updateHighlightCount() {
    if (this.highlightCounter) {
      const highlights = getHighlights();
      let totalHighlights = 0;
      
      Object.values(highlights).forEach(pageHighlights => {
        if (Array.isArray(pageHighlights)) {
          totalHighlights += pageHighlights.length;
        }
      });
      
      this.highlightCounter.textContent = `${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''}`;
    }
  }
  
  /**
   * Clear all highlights
   */
  clearAllHighlights() {
    const highlights = getHighlights();
    let totalHighlights = 0;
    
    Object.values(highlights).forEach(pageHighlights => {
      if (Array.isArray(pageHighlights)) {
        totalHighlights += pageHighlights.length;
      }
    });
    
    if (totalHighlights === 0) {
      alert('No highlights to clear.');
      return;
    }
    
    const confirmClear = confirm('Are you sure you want to clear all highlights? This action can be undone with Cmd+Z.');
    if (confirmClear) {
      window.dispatchEvent(new CustomEvent('pdf-clear-all-highlights'));
      // Update the highlight count after clearing
      this.updateHighlightCount();
    }
  }
  
  /**
   * Extract highlights to markdown file
   * If text is selected, highlight it first before extracting
   */
  async extractHighlights() {
    try {
      // Check if there's text selected and no highlights yet - if so, highlight the selection first
      const selection = window.getSelection();
      if (selection && selection.toString().trim() && selection.rangeCount > 0) {
        // Check if this selection is within the PDF viewer
        const range = selection.getRangeAt(0);
        const pdfContainer = range.commonAncestorContainer.closest?.('.pdf-viewer-container') || 
                           range.commonAncestorContainer.parentElement?.closest?.('.pdf-viewer-container');
        
        if (pdfContainer) {
          console.log('Creating highlight from selected text before extraction');
          // Create highlight from selection
          window.dispatchEvent(new CustomEvent('pdf-highlight-selection'));
          
          // Wait a moment for the highlight to be created
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const markdownPath = await extractHighlightsToMarkdown(this.pdfPath);
      console.log(`Highlights extracted to: ${markdownPath}`);
      
      // Show success notification instead of auto-opening
      alert(`Highlights extracted successfully!\nSaved to: ${markdownPath.split('/').pop()}`);
      
      // File will appear in the file tree for manual opening
    } catch (error) {
      console.error('Error extracting highlights:', error);
      alert(`Failed to extract highlights: ${error.message}`);
    }
  }
  
  /**
   * Set up keyboard shortcuts for PDF navigation
   */
  setupKeyboardShortcuts() {
    // Use a bound function to maintain context
    this.keyboardHandler = (e) => {
      // Only handle shortcuts when this PDF tab is active
      if (!this.container || !this.container.closest('.tab-content.active')) {
        return;
      }
      
      // Navigation shortcuts
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.previousPage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.nextPage();
      }
      
      // Zoom shortcuts
      else if (e.metaKey && e.key === '+') {
        e.preventDefault();
        this.handleZoomIn();
      } else if (e.metaKey && e.key === '-') {
        e.preventDefault();
        this.handleZoomOut();
      }
      
      // Extract highlights
      else if (e.metaKey && e.shiftKey && e.key === 'e') {
        e.preventDefault();
        this.extractHighlights();
      }
      
      // Highlight selected text
      else if (e.metaKey && e.shiftKey && e.key === 'h') {
        e.preventDefault();
        // This will be handled by PDFHighlightManager
        window.dispatchEvent(new CustomEvent('pdf-highlight-selection'));
      }
      
      // Undo highlight
      else if (e.metaKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pdf-undo-highlight'));
      }
      
      // Redo highlight
      else if (e.metaKey && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('pdf-redo-highlight'));
      }
    };
    
    document.addEventListener('keydown', this.keyboardHandler);
  }
  
  /**
   * Clean up when tab is closed
   */
  destroy() {
    console.log('Destroying PDF tab');
    
    // Remove keyboard event listener
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
    }
    
    // Save highlights before closing
    saveHighlights(this.pdfPath).catch(error => {
      console.error('Error saving highlights on close:', error);
    });
    
    // Clear container
    if (this.container) {
      this.container.remove();
    }
  }
  
  /**
   * Update scroll position to track current page
   */
  updateCurrentPage() {
    const pages = this.viewerContainer.querySelectorAll('.pdf-page');
    const containerRect = this.viewerContainer.getBoundingClientRect();
    
    for (let i = 0; i < pages.length; i++) {
      const pageRect = pages[i].getBoundingClientRect();
      // Check if page is in viewport
      if (pageRect.top < containerRect.top + containerRect.height / 2 &&
          pageRect.bottom > containerRect.top) {
        const newPage = parseInt(pages[i].getAttribute('data-page-number'));
        if (newPage !== this.currentPage) {
          this.currentPage = newPage;
          this.updatePageCounter();
        }
        break;
      }
    }
  }
  
  /**
   * Focus the PDF viewer
   */
  focus() {
    if (this.viewerContainer) {
      this.viewerContainer.focus();
    }
  }
}