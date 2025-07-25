// PDFHighlightManager.js: Manages text selection, highlighting, and persistence for PDFs
// Handles highlight creation, storage, and extraction to markdown

import { invoke } from '@tauri-apps/api/core';
import { dirname, join, basename } from '@tauri-apps/api/path';
import { 
  getHighlights, 
  setHighlights, 
  addHighlight,
  getCurrentScale
} from './PDFViewer.js';

// Track current selection for highlighting
let currentSelection = null;
let pdfPath = null;
let container = null;

// Undo/redo history
let highlightHistory = [];
let historyIndex = -1;
const MAX_HISTORY = 50;

/**
 * Initialize the highlight manager for a PDF viewer
 * @param {HTMLElement} viewerContainer - The PDF viewer container
 * @param {string} filePath - Path to the PDF file
 */
export function initHighlightManager(viewerContainer, filePath) {
  console.log('Initializing highlight manager for:', filePath);
  
  container = viewerContainer;
  pdfPath = filePath;
  
  // Set up selection tracking
  viewerContainer.addEventListener('mouseup', handleTextSelection);
  
  // Listen for highlight command
  window.addEventListener('pdf-highlight-selection', highlightCurrentSelection);
  
  // Listen for undo/redo commands
  window.addEventListener('pdf-undo-highlight', undoHighlight);
  window.addEventListener('pdf-redo-highlight', redoHighlight);
  window.addEventListener('pdf-clear-all-highlights', handleClearAllHighlights);
  
  // Track scroll for better selection handling
  viewerContainer.addEventListener('scroll', () => {
    // Update current page tracking in PDFTab
    const pdfTab = viewerContainer.closest('.pdf-container');
    if (pdfTab && pdfTab.__pdfTabInstance) {
      pdfTab.__pdfTabInstance.updateCurrentPage();
    }
  });
  
  // Initialize history with current state
  saveToHistory();
}

/**
 * Handle text selection events
 * @param {MouseEvent} event - Mouse up event
 */
function handleTextSelection(event) {
  const selection = window.getSelection();
  
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    currentSelection = null;
    return;
  }
  
  // Get the selected range
  const range = selection.getRangeAt(0);
  
  // Check if selection is within the PDF viewer
  if (!container.contains(range.commonAncestorContainer)) {
    currentSelection = null;
    return;
  }
  
  // Store current selection info
  currentSelection = {
    range: range,
    text: selection.toString().trim()
  };
  
  console.log('Text selected:', currentSelection.text.substring(0, 50) + '...');
}

/**
 * Highlight the current selection
 */
async function highlightCurrentSelection() {
  if (!currentSelection || !currentSelection.text) {
    console.log('No text selected to highlight');
    return;
  }
  
  try {
    // Get the page number from the selection
    const pageElement = getPageElementFromNode(currentSelection.range.commonAncestorContainer);
    if (!pageElement) {
      console.error('Could not determine page for selection');
      return;
    }
    
    const pageNum = parseInt(pageElement.getAttribute('data-page-number'));
    
    // Get bounding rectangles for the selection
    const rects = Array.from(currentSelection.range.getClientRects());
    
    // Convert to page-relative coordinates
    const pageRect = pageElement.getBoundingClientRect();
    const scale = getCurrentScale();
    
    const bounds = rects.map(rect => {
      return [
        (rect.left - pageRect.left) / scale,
        (rect.top - pageRect.top) / scale,
        rect.width / scale,
        rect.height / scale
      ];
    });
    
    // Create highlight object
    const highlight = {
      text: currentSelection.text,
      bounds: bounds,
      timestamp: new Date().toISOString()
    };
    
    // Save current state to history before making changes
    saveToHistory();
    
    // Add to highlights
    addHighlight(pageNum, highlight);
    
    // Debug: Check highlights state after adding
    const currentHighlights = getHighlights();
    // console.log('Debug: After addHighlight, highlights state:', currentHighlights);
    // console.log('Debug: Number of pages with highlights:', Object.keys(currentHighlights).length);
    
    // Render the highlight immediately
    renderHighlight(pageElement, highlight, pageNum);
    
    // Save highlights
    await saveHighlights(pdfPath);
    
    // Update the highlight count in the toolbar
    updateHighlightCountInToolbar();
    
    // Clear selection
    window.getSelection().removeAllRanges();
    currentSelection = null;
    
    console.log(`Highlighted text on page ${pageNum}`);
  } catch (error) {
    console.error('Error creating highlight:', error);
  }
}

/**
 * Get the page element containing a node
 * @param {Node} node - DOM node
 * @returns {HTMLElement|null} Page element or null
 */
function getPageElementFromNode(node) {
  let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  
  while (element && !element.classList.contains('pdf-page')) {
    element = element.parentElement;
  }
  
  return element;
}

/**
 * Render a single highlight on a page
 * @param {HTMLElement} pageElement - Page container element
 * @param {Object} highlight - Highlight object
 * @param {number} pageNum - Page number
 */
function renderHighlight(pageElement, highlight, pageNum) {
  const scale = getCurrentScale();
  
  highlight.bounds.forEach((rect, index) => {
    const highlightDiv = document.createElement('div');
    highlightDiv.className = 'pdf-highlight';
    highlightDiv.style.position = 'absolute';
    highlightDiv.style.left = `${rect[0] * scale}px`;
    highlightDiv.style.top = `${rect[1] * scale}px`;
    highlightDiv.style.width = `${rect[2] * scale}px`;
    highlightDiv.style.height = `${rect[3] * scale}px`;
    highlightDiv.style.backgroundColor = 'rgba(255, 255, 0, 0.4)'; // Yellow
    highlightDiv.style.pointerEvents = 'none';
    highlightDiv.style.mixBlendMode = 'multiply';
    highlightDiv.setAttribute('data-page', pageNum);
    highlightDiv.setAttribute('data-highlight-text', highlight.text);
    
    pageElement.appendChild(highlightDiv);
  });
}

/**
 * Save highlights to disk
 * @param {string} filePath - PDF file path
 */
export async function saveHighlights(filePath) {
  try {
    const highlights = getHighlights();
    if (Object.keys(highlights).length === 0) {
      console.log('No highlights to save');
      return;
    }
    
    // Create highlights directory
    const pdfDir = await dirname(filePath);
    const highlightsDir = await join(pdfDir, '.gaimplan', 'pdf-highlights');
    
    // Directory will be created automatically when writing the file
    
    // Save highlights file
    const pdfName = await basename(filePath);
    const highlightsPath = await join(highlightsDir, `${pdfName}.json`);
    
    await invoke('write_file_content', { 
      filePath: highlightsPath, 
      content: JSON.stringify(highlights, null, 2) 
    });
    console.log(`Saved highlights to: ${highlightsPath}`);
  } catch (error) {
    console.error('Error saving highlights:', error);
  }
}

/**
 * Load highlights from disk
 * @param {string} filePath - PDF file path
 */
export async function loadHighlights(filePath) {
  try {
    const pdfDir = await dirname(filePath);
    const pdfName = await basename(filePath);
    const highlightsPath = await join(pdfDir, '.gaimplan', 'pdf-highlights', `${pdfName}.json`);
    
    try {
      const content = await invoke('read_file_content', { filePath: highlightsPath });
      const highlights = JSON.parse(content);
      setHighlights(highlights);
      console.log('Loaded highlights from:', highlightsPath);
      // Update count after loading
      updateHighlightCountInToolbar();
    } catch (error) {
      // File doesn't exist or error reading
      console.log('No existing highlights found');
      setHighlights({});
    }
  } catch (error) {
    console.error('Error loading highlights:', error);
    setHighlights({});
  }
}

/**
 * Extract all highlights to a markdown file
 * @param {string} filePath - PDF file path
 * @returns {Promise<string>} Path to the created markdown file
 */
export async function extractHighlightsToMarkdown(filePath) {
  try {
    // Get current highlights from memory (they should already be loaded and up-to-date)
    const highlights = getHighlights();
    const pdfName = await basename(filePath);
    const pdfNameWithoutExt = pdfName.replace(/\.pdf$/i, '');
    
    // console.log('Debug: EXTRACT - Highlights data:', highlights);
    // console.log('Debug: EXTRACT - Number of pages with highlights:', Object.keys(highlights).length);
    // console.log('Debug: EXTRACT - Highlights keys:', Object.keys(highlights));
    
    // Generate markdown content
    let markdown = `# PDF Highlights: ${pdfName}\n\n`;
    
    if (Object.keys(highlights).length === 0) {
      markdown += '*No highlights found in this PDF.*\n';
    } else {
      // Sort pages numerically
      const sortedPages = Object.keys(highlights).sort((a, b) => parseInt(a) - parseInt(b));
      
      for (const pageNum of sortedPages) {
        const pageHighlights = highlights[pageNum];
        
        if (pageHighlights && pageHighlights.length > 0) {
          markdown += `## Page ${pageNum}\n\n`;
          
          pageHighlights.forEach((highlight, index) => {
            markdown += `- "${highlight.text}"\n`;
          });
          
          markdown += '\n';
        }
      }
    }
    
    // Add metadata
    markdown += `---\n\n`;
    markdown += `*Extracted on: ${new Date().toLocaleString()}*\n`;
    markdown += `*Source: ${pdfName}*\n`;
    
    // Save markdown file
    const pdfDir = await dirname(filePath);
    const markdownPath = await join(pdfDir, `${pdfNameWithoutExt}-highlights.md`);
    
    await invoke('write_file_content', { 
      filePath: markdownPath, 
      content: markdown 
    });
    console.log(`Extracted highlights to: ${markdownPath}`);
    
    // Emit event that file was updated
    window.dispatchEvent(new CustomEvent('file-updated', { 
      detail: { filePath: markdownPath }
    }));
    
    return markdownPath;
  } catch (error) {
    console.error('Error extracting highlights:', error);
    throw error;
  }
}

/**
 * Update highlight count in the toolbar
 */
function updateHighlightCountInToolbar() {
  const highlightCounter = document.querySelector('.pdf-highlight-count');
  if (highlightCounter) {
    const highlights = getHighlights();
    let totalHighlights = 0;
    
    Object.values(highlights).forEach(pageHighlights => {
      if (Array.isArray(pageHighlights)) {
        totalHighlights += pageHighlights.length;
      }
    });
    
    highlightCounter.textContent = `${totalHighlights} highlight${totalHighlights !== 1 ? 's' : ''}`;
  }
}

/**
 * Save current highlights state to history
 */
function saveToHistory() {
  const currentHighlights = getHighlights();
  
  // Remove any states after current index (when we add new state after undo)
  highlightHistory = highlightHistory.slice(0, historyIndex + 1);
  
  // Add current state
  highlightHistory.push(JSON.parse(JSON.stringify(currentHighlights)));
  historyIndex++;
  
  // Limit history size
  if (highlightHistory.length > MAX_HISTORY) {
    highlightHistory.shift();
    historyIndex--;
  }
}

/**
 * Undo last highlight action
 */
async function undoHighlight() {
  if (historyIndex <= 0) {
    console.log('Nothing to undo');
    return;
  }
  
  historyIndex--;
  const previousState = highlightHistory[historyIndex];
  
  // Apply the previous state
  setHighlights(previousState);
  
  // Re-render all highlights
  reRenderAllHighlights();
  
  // Save to disk
  await saveHighlights(pdfPath);
  
  // Update count
  updateHighlightCountInToolbar();
  
  console.log('Undid highlight action');
}

/**
 * Redo previously undone highlight action
 */
async function redoHighlight() {
  if (historyIndex >= highlightHistory.length - 1) {
    console.log('Nothing to redo');
    return;
  }
  
  historyIndex++;
  const nextState = highlightHistory[historyIndex];
  
  // Apply the next state
  setHighlights(nextState);
  
  // Re-render all highlights
  reRenderAllHighlights();
  
  // Save to disk
  await saveHighlights(pdfPath);
  
  // Update count
  updateHighlightCountInToolbar();
  
  console.log('Redid highlight action');
}

/**
 * Re-render all highlights on all pages
 */
function reRenderAllHighlights() {
  // Remove all existing highlight elements
  if (container) {
    const existingHighlights = container.querySelectorAll('.pdf-highlight');
    existingHighlights.forEach(el => el.remove());
  }
  
  // Re-render highlights for each page
  const highlights = getHighlights();
  Object.entries(highlights).forEach(([pageNum, pageHighlights]) => {
    const pageElement = container.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageElement && pageHighlights.length > 0) {
      pageHighlights.forEach((highlight, index) => {
        renderHighlight(pageElement, highlight, pageNum);
      });
    }
  });
}

/**
 * Handle clear all highlights with history
 */
async function handleClearAllHighlights() {
  // Save current state to history first
  saveToHistory();
  
  // Clear all highlights
  await clearAllHighlights();
}

/**
 * Clear all highlights from the current PDF
 */
export async function clearAllHighlights() {
  // Remove highlight elements from DOM
  if (container) {
    const highlightElements = container.querySelectorAll('.pdf-highlight');
    highlightElements.forEach(el => el.remove());
  }
  
  // Clear from memory
  setHighlights({});
  
  // Delete the highlight file completely
  if (pdfPath) {
    try {
      const pdfDir = await dirname(pdfPath);
      const highlightsDir = await join(pdfDir, '.gaimplan', 'pdf-highlights');
      const pdfName = await basename(pdfPath);
      const highlightsPath = await join(highlightsDir, `${pdfName}.json`);
      
      // Delete the highlight file
      await invoke('delete_file', { filePath: highlightsPath });
      console.log(`Deleted highlight file: ${highlightsPath}`);
    } catch (error) {
      // File might not exist, which is fine
      console.log('No highlight file to delete or error deleting:', error);
    }
  }
  
  console.log('All highlights cleared');
  
  // Update the highlight count in the toolbar
  updateHighlightCountInToolbar();
}