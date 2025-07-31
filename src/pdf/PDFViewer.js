// PDFViewer.js: Core module for PDF rendering with text selection support
// Uses PDF.js library to render PDFs with text layer for selection capabilities

import * as pdfjsLib from 'pdfjs-dist';
import { invoke } from '@tauri-apps/api/core';
import windowContext from '../contexts/WindowContext.js';

// Configure PDF.js worker - use local worker to avoid CDN issues
// The worker is copied to public directory during build
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.js';

console.log('PDF.js worker configured successfully');

// Make debug function available globally
window.debugPDFSelection = function() { return debugSelectionStyles(); };

// Inject critical selection styles to ensure they're loaded
const injectSelectionStyles = () => {
  if (document.getElementById('pdf-selection-override')) return;
  
  const styleEl = document.createElement('style');
  styleEl.id = 'pdf-selection-override';
  styleEl.textContent = `
    /* PDF.js Standard Text Layer Styles */
    .textLayer {
      position: absolute;
      text-align: initial;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 1;
      line-height: 1;
      -webkit-text-size-adjust: none;
      -moz-text-size-adjust: none;
      text-size-adjust: none;
      forced-color-adjust: none;
      transform-origin: 0 0;
      z-index: 2;
      font-family: sans-serif;
    }
    
    .textLayer span,
    .textLayer br {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0 0;
    }
    
    /* Clean, smooth selection highlighting like Obsidian */
    .textLayer ::selection {
      background: rgba(0, 123, 255, 0.3);
      color: transparent;
    }
    
    .textLayer ::-moz-selection {
      background: rgba(0, 123, 255, 0.3);
      color: transparent;
    }
    
    /* Aggressive selection bridging to fill gaps */
    .textLayer span::selection {
      background: rgba(0, 123, 255, 0.3);
      color: transparent;
      /* Extend horizontally to bridge word gaps */
      padding-left: 3px;
      padding-right: 3px;
      margin-left: -3px;
      margin-right: -3px;
      /* Extend vertically to connect lines */
      padding-top: 2px;
      padding-bottom: 2px;
      margin-top: -2px;
      margin-bottom: -2px;
    }
    
    .textLayer span::-moz-selection {
      background: rgba(0, 123, 255, 0.3);
      color: transparent;
      padding-left: 3px;
      padding-right: 3px;
      margin-left: -3px;
      margin-right: -3px;
      padding-top: 2px;
      padding-bottom: 2px;
      margin-top: -2px;
      margin-bottom: -2px;
    }
    
    /* Fill gaps with pseudo-elements */
    .textLayer span::before {
      content: '';
      position: absolute;
      left: -5px;
      right: -5px;
      top: -2px;
      bottom: -2px;
      background: transparent;
      pointer-events: none;
      z-index: -1;
    }
    
    /* Ensure text layer doesn't block canvas */
    .textLayer {
      mix-blend-mode: multiply;
    }
    
    /* Remove any visual artifacts from PDF.js */
    .textLayer span {
      border: none !important;
      outline: none !important;
      background: transparent !important;
    }
    
    /* Hide PDF.js internal elements */
    .textLayer .endOfContent,
    .textLayer .highlight,
    .textLayer .selected {
      display: none !important;
    }
  `;
  document.head.appendChild(styleEl);
  console.log('PDF selection styles injected');
};

// Inject styles on load
injectSelectionStyles();

// Global variables for PDF state management
let currentPDF = null;
let currentScale = 1.5;
let highlights = {}; // Structure: { pageNum: [{ bounds: [[x,y,w,h]], text: string }] }

/**
 * Load a PDF document from URL or file path
 * @param {string} urlOrPath - The URL of the PDF file or file path
 * @param {string} filePath - The original file path (for reading via Tauri)
 * @returns {Promise<number>} - Total number of pages in the PDF
 */
export async function loadPDF(urlOrPath, filePath = null) {
  console.log(`Loading PDF from: ${urlOrPath}`);
  console.log('Worker configured at:', pdfjsLib.GlobalWorkerOptions.workerSrc);
  
  try {
    let pdfData;
    
    // If we have a file path, try to read the file directly using Tauri
    if (filePath && invoke) {
      console.log('Reading PDF file via Tauri API...');
      console.log('File path:', filePath);
      
      try {
        // Read the file as base64
        console.log('Invoking read_file_base64 with path:', filePath);
        const base64Data = await invoke('read_file_base64', { path: filePath });
        console.log('Base64 data received, length:', base64Data.length);
        
        // Convert base64 to Uint8Array
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        pdfData = { data: bytes };
        console.log('PDF file read successfully, size:', bytes.length);
      } catch (readError) {
        console.error('Failed to read file via Tauri:', readError);
        console.error('Error details:', {
          name: readError.name,
          message: readError.message,
          stack: readError.stack
        });
        
        // Try alternative approach using read_image_as_base64 with relative path
        try {
          console.log('Trying alternative file reading approach...');
          // Extract relative path from full path if needed
          let relativePath = filePath;
          if (windowContext.vaultPath && filePath.startsWith(windowContext.vaultPath)) {
            relativePath = filePath.substring(windowContext.vaultPath.length + 1);
          }
          
          console.log('Reading via read_image_as_base64 with relative path:', relativePath);
          const base64Data = await invoke('read_image_as_base64', { path: relativePath });
          console.log('Alternative read successful, base64 length:', base64Data.length);
          
          // Convert base64 to Uint8Array
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfData = { data: bytes };
          console.log('PDF converted to bytes, size:', bytes.length);
        } catch (altError) {
          console.error('Alternative approach also failed:', altError);
          // Final fallback to URL approach
          pdfData = { url: urlOrPath };
        }
      }
    } else {
      // Use URL approach for web or if file reading fails
      console.log('Using URL approach (no file path or invoke not available):', urlOrPath);
      pdfData = { url: urlOrPath };
    }
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      ...pdfData,
      withCredentials: false,
      verbosity: 1 // Normal logging
    });
    
    loadingTask.onProgress = (progress) => {
      console.log(`Loading progress: ${progress.loaded}/${progress.total}`);
    };
    
    currentPDF = await loadingTask.promise;
    
    console.log(`PDF loaded successfully: ${currentPDF.numPages} pages`);
    return currentPDF.numPages;
  } catch (error) {
    console.error('Error loading PDF:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    throw new Error(`Failed to load PDF: ${error.message}`);
  }
}

/**
 * Render all pages of the PDF at once (suitable for small PDFs)
 * @param {HTMLElement} container - The container element to render pages into
 */
export async function renderAllPages(container) {
  if (!currentPDF) {
    console.error('No PDF loaded');
    return;
  }
  
  console.log(`Rendering all ${currentPDF.numPages} pages`);
  
  // Clear container before rendering
  container.innerHTML = '';
  
  // Render each page sequentially
  for (let pageNum = 1; pageNum <= currentPDF.numPages; pageNum++) {
    await renderPage(pageNum, container);
  }
}

/**
 * Render a single PDF page with text layer
 * @param {number} pageNum - Page number to render (1-indexed)
 * @param {HTMLElement} container - Container to append the page to
 */
async function renderPage(pageNum, container) {
  console.log(`Rendering page ${pageNum}`);
  
  try {
    // Get the page
    const page = await currentPDF.getPage(pageNum);
    
    // Calculate viewport with current scale
    const viewport = page.getViewport({ scale: currentScale });
    
    // Create page container
    const pageDiv = document.createElement('div');
    pageDiv.className = 'pdf-page';
    pageDiv.setAttribute('data-page-number', pageNum);
    pageDiv.style.position = 'relative';
    pageDiv.style.width = `${viewport.width}px`;
    pageDiv.style.height = `${viewport.height}px`;
    pageDiv.style.marginBottom = '20px';
    pageDiv.style.backgroundColor = 'white';
    pageDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    
    // Create canvas for visual rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    // Handle high DPI displays for crisp rendering
    const outputScale = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    
    // Apply scaling transform if needed
    const transform = outputScale !== 1
      ? [outputScale, 0, 0, outputScale, 0, 0]
      : null;
    
    // Render PDF page to canvas
    const renderContext = {
      canvasContext: context,
      viewport: viewport,
      transform: transform
    };
    
    await page.render(renderContext).promise;
    console.log(`Canvas rendered for page ${pageNum}`);
    
    // Create text layer for selection support
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.position = 'absolute';
    textLayerDiv.style.left = '0';
    textLayerDiv.style.top = '0';
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    textLayerDiv.style.overflow = 'hidden';
    textLayerDiv.style.lineHeight = '1';
    textLayerDiv.style.opacity = '1'; // Full opacity for selection visibility
    
    // Get text content and render text layer
    const textContent = await page.getTextContent();
    console.log(`Text content retrieved for page ${pageNum}: ${textContent.items.length} text items`);
    
    // Import text layer builder CSS - this is critical for selection visibility
    // Skip loading external PDF.js viewer CSS to avoid conflicts
    // We'll use our own optimized styles instead
    
    // Create text divs array for better control
    const textDivs = [];
    
    // Use the new TextLayer API (renderTextLayer is deprecated in PDF.js 5)
    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: textDivs,
      enhanceTextSelection: false // Disable to allow natural selection
    });
    
    await textLayer.render();
    console.log(`Text layer rendered for page ${pageNum}`);
    
    // Assemble page
    pageDiv.appendChild(canvas);
    pageDiv.appendChild(textLayerDiv);
    container.appendChild(pageDiv);
    
    // Add selection tracking for debugging
    textLayerDiv.addEventListener('mouseup', () => {
      const selection = window.getSelection();
      const selectedText = selection.toString();
      
      if (selectedText) {
        console.log('🔵 Text selected:', selectedText);
        
        // Get selection rectangles for future highlight implementation
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rects = range.getClientRects();
          console.log('🔵 Selection rectangles:', rects.length);
        }
      }
    });
    
    // Restore highlights for this page if any exist
    if (highlights[pageNum]) {
      renderHighlightsForPage(pageNum, pageDiv);
    }
    
  } catch (error) {
    console.error(`Error rendering page ${pageNum}:`, error);
  }
}

/**
 * Render highlights for a specific page
 * @param {number} pageNum - Page number
 * @param {HTMLElement} pageDiv - Page container element
 */
function renderHighlightsForPage(pageNum, pageDiv) {
  const pageHighlights = highlights[pageNum];
  if (!pageHighlights || pageHighlights.length === 0) return;
  
  console.log(`Rendering ${pageHighlights.length} highlights for page ${pageNum}`);
  
  pageHighlights.forEach((highlight, index) => {
    highlight.bounds.forEach((rect) => {
      const highlightDiv = document.createElement('div');
      highlightDiv.className = 'pdf-highlight';
      highlightDiv.style.position = 'absolute';
      highlightDiv.style.left = `${rect[0] * currentScale}px`;
      highlightDiv.style.top = `${rect[1] * currentScale}px`;
      highlightDiv.style.width = `${rect[2] * currentScale}px`;
      highlightDiv.style.height = `${rect[3] * currentScale}px`;
      highlightDiv.style.backgroundColor = 'rgba(255, 255, 0, 0.4)'; // Yellow highlight
      highlightDiv.style.pointerEvents = 'none'; // Don't interfere with text selection
      highlightDiv.style.mixBlendMode = 'multiply';
      highlightDiv.setAttribute('data-highlight-index', index);
      
      pageDiv.appendChild(highlightDiv);
    });
  });
}

/**
 * Zoom in by 20%
 * @param {HTMLElement} container - Container with rendered pages
 */
export async function zoomIn(container) {
  currentScale *= 1.2;
  console.log(`Zooming in to scale: ${currentScale}`);
  await renderAllPages(container);
}

/**
 * Zoom out by 20%
 * @param {HTMLElement} container - Container with rendered pages
 */
export async function zoomOut(container) {
  currentScale /= 1.2;
  console.log(`Zooming out to scale: ${currentScale}`);
  await renderAllPages(container);
}

/**
 * Get current highlights
 * @returns {Object} Current highlights object
 */
export function getHighlights() {
  return highlights;
}

/**
 * Set highlights (used when loading from storage)
 * @param {Object} newHighlights - Highlights object to set
 */
export function setHighlights(newHighlights) {
  highlights = newHighlights;
  console.log('Highlights loaded:', Object.keys(highlights).length, 'pages with highlights');
}

/**
 * Add a highlight to a specific page
 * @param {number} pageNum - Page number
 * @param {Object} highlight - Highlight object with bounds and text
 */
export function addHighlight(pageNum, highlight) {
  if (!highlights[pageNum]) {
    highlights[pageNum] = [];
  }
  highlights[pageNum].push(highlight);
  console.log(`Added highlight to page ${pageNum}: "${highlight.text.substring(0, 50)}..."`);
}

/**
 * Clear all highlights
 */
export function clearHighlights() {
  highlights = {};
  console.log('All highlights cleared');
}

/**
 * Get current scale
 * @returns {number} Current zoom scale
 */
export function getCurrentScale() {
  return currentScale;
}

/**
 * Get current PDF document
 * @returns {Object|null} Current PDF document or null
 */
export function getCurrentPDF() {
  return currentPDF;
}

/**
 * Debug selection styles - call this from console
 */
export function debugSelectionStyles() {
  console.log('🔵 PDF Selection Debug Info:');
  
  // Check if styles are loaded
  const styleSheets = Array.from(document.styleSheets);
  const pdfViewerStyles = styleSheets.find(sheet => {
    try {
      return sheet.href && sheet.href.includes('pdf-viewer.css');
    } catch (e) {
      return false;
    }
  });
  
  console.log('PDF Viewer stylesheet loaded:', !!pdfViewerStyles);
  
  // Check text layers
  const textLayers = document.querySelectorAll('.textLayer');
  console.log(`Found ${textLayers.length} text layers`);
  
  textLayers.forEach((layer, index) => {
    const computed = window.getComputedStyle(layer);
    const spans = layer.querySelectorAll('span');
    console.log(`Text layer ${index}:`, {
      opacity: computed.opacity,
      userSelect: computed.userSelect,
      position: computed.position,
      spanCount: spans.length,
      className: layer.className,
      parentClasses: layer.parentElement?.className
    });
    
    // Check first span
    if (spans.length > 0) {
      const span = spans[0];
      const spanStyle = window.getComputedStyle(span);
      console.log(`First span in layer ${index}:`, {
        color: spanStyle.color,
        userSelect: spanStyle.userSelect,
        position: spanStyle.position
      });
    }
  });
  
  // Try to get selection styles
  const testDiv = document.createElement('div');
  testDiv.className = 'textLayer';
  testDiv.innerHTML = '<span>Test</span>';
  document.body.appendChild(testDiv);
  
  const testSpan = testDiv.querySelector('span');
  const selectionStyle = window.getComputedStyle(testSpan, '::selection');
  console.log('Test ::selection styles:', {
    backgroundColor: selectionStyle.backgroundColor,
    color: selectionStyle.color
  });
  
  document.body.removeChild(testDiv);
  
  // Check for selecting class
  const selectingPages = document.querySelectorAll('.pdf-page.selecting');
  console.log(`Pages with 'selecting' class: ${selectingPages.length}`);
  
  return 'Debug info logged to console';
}

