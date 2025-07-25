import { invoke } from '@tauri-apps/api/core';
import { qdrantSync } from '../sync/QdrantSync.js';
import { mcpManager } from '../mcp/MCPManager.js';

export class GlobalSearch {
  constructor() {
    this.container = null;
    this.isVisible = false;
    this.searchMode = 'hybrid'; // 'keyword', 'semantic', or 'hybrid'
    this.currentQuery = '';
    this.searchResults = [];
    this.selectedIndex = -1;
    
    // Bind methods
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.toggle = this.toggle.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleSearch = this.handleSearch.bind(this);
  }

  mount() {
    // Create container
    this.container = document.createElement('div');
    this.container.className = 'global-search-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100000;
      display: none;
      backdrop-filter: blur(4px);
    `;

    // Create search panel
    const panel = document.createElement('div');
    panel.className = 'global-search-panel';
    panel.style.cssText = `
      position: absolute;
      top: 20%;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      max-width: 90vw;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
      overflow: hidden;
    `;

    panel.innerHTML = `
      <div class="search-header" style="
        padding: 16px;
        border-bottom: 1px solid var(--border-color);
      ">
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="text" 
            class="search-input" 
            placeholder="Search notes..."
            style="
              flex: 1;
              padding: 8px 12px;
              background: var(--bg-secondary);
              border: 1px solid var(--border-color);
              border-radius: 6px;
              color: var(--text-primary);
              font-size: 14px;
              outline: none;
            ">
          <div class="search-mode-toggle" style="
            display: flex;
            background: var(--bg-secondary);
            border-radius: 6px;
            padding: 2px;
          ">
            <button class="mode-btn keyword-mode" data-mode="keyword" style="
              padding: 6px 12px;
              background: transparent;
              border: none;
              color: var(--text-secondary);
              font-size: 12px;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.2s;
            ">Keyword</button>
            <button class="mode-btn semantic-mode" data-mode="semantic" style="
              padding: 6px 12px;
              background: transparent;
              border: none;
              color: var(--text-secondary);
              font-size: 12px;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.2s;
            ">Semantic</button>
            <button class="mode-btn hybrid-mode active" data-mode="hybrid" style="
              padding: 6px 12px;
              background: var(--accent-color);
              border: none;
              color: white;
              font-size: 12px;
              cursor: pointer;
              border-radius: 4px;
              transition: all 0.2s;
            ">Hybrid</button>
          </div>
          <button class="sync-btn" title="Sync vault to Qdrant" style="
            padding: 6px 12px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--text-primary);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            Sync
          </button>
        </div>
        <div class="search-hint" style="
          margin-top: 8px;
          font-size: 11px;
          color: var(--text-secondary);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <span class="mode-description">Finding conceptually similar notes using AI embeddings</span>
          <span class="sync-status" style="display: none;"></span>
        </div>
      </div>
      <div class="search-results" style="
        max-height: 400px;
        overflow-y: auto;
      ">
        <div class="search-placeholder" style="
          padding: 40px;
          text-align: center;
          color: var(--text-secondary);
        ">
          Start typing to search your notes
        </div>
      </div>
    `;

    this.container.appendChild(panel);
    document.body.appendChild(this.container);

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Click outside to close
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.hide();
      }
    });

    // Search input
    const input = this.container.querySelector('.search-input');
    let searchTimeout;
    input.addEventListener('input', (e) => {
      this.currentQuery = e.target.value;
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.handleSearch();
      }, 300); // Debounce
    });

    // Mode toggle
    const modeBtns = this.container.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.searchMode = btn.dataset.mode;
        this.updateModeUI();
        if (this.currentQuery) {
          this.handleSearch();
        }
      });
    });

    // Keyboard navigation
    input.addEventListener('keydown', this.handleKeyDown);

    // Sync button
    const syncBtn = this.container.querySelector('.sync-btn');
    syncBtn.addEventListener('click', () => this.handleSync());
  }

  updateModeUI() {
    const modeBtns = this.container.querySelectorAll('.mode-btn');
    const modeDesc = this.container.querySelector('.mode-description');
    
    modeBtns.forEach(btn => {
      if (btn.dataset.mode === this.searchMode) {
        btn.classList.add('active');
        btn.style.background = 'var(--accent-color)';
        btn.style.color = 'white';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = 'var(--text-secondary)';
      }
    });

    const descriptions = {
      'keyword': 'Searching for exact keyword matches',
      'semantic': 'Finding conceptually similar notes using AI embeddings',
      'hybrid': 'Combining graph relationships and semantic similarity for comprehensive results'
    };
    modeDesc.textContent = descriptions[this.searchMode] || descriptions.hybrid;
  }

  async handleSearch() {
    if (!this.currentQuery.trim()) {
      this.displayPlaceholder();
      return;
    }

    try {
      const resultsContainer = this.container.querySelector('.search-results');
      resultsContainer.innerHTML = `
        <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
          Searching...
        </div>
      `;

      let results = [];
      if (this.searchMode === 'hybrid') {
        // For hybrid search, combine backend graph search with frontend semantic search
        try {
          // First check search capabilities
          const capabilities = await invoke('get_search_capabilities');
          
          if (capabilities.semantic_handler === 'frontend_mcp') {
            // Run graph search on backend and semantic search on frontend in parallel
            const [graphResults, semanticResults] = await Promise.all([
              // Get graph results from backend
              invoke('search_with_mode', {
                query: this.currentQuery,
                mode: 'graph',
                maxResults: 40 // Get more for fusion
              }).catch(err => {
                console.error('Graph search error:', err);
                return [];
              }),
              
              // Get semantic results from frontend MCP
              this.performSemanticSearchMCP(this.currentQuery, 40).catch(err => {
                console.error('Semantic search error:', err);
                return [];
              })
            ]);
            
            // Fuse results using RRF (Reciprocal Rank Fusion)
            results = this.fuseSearchResults(graphResults, semanticResults);
            
            // Batch resolve any node IDs that need resolution
            await this.resolveNodeIds(results);
          } else {
            // Fallback to backend hybrid search if capabilities changed
            const hybridResults = await invoke('search_with_mode', {
              query: this.currentQuery,
              mode: 'hybrid',
              maxResults: 20
            });
            
            results = hybridResults.map(r => ({
              note: {
                path: r.file_path,
                title: r.title || r.file_path.split('/').pop(),
                content: r.preview || ''
              },
              score: r.rrf_score || r.relevance_score,
              matchType: r.match_type,
              relationshipPath: r.relationship_path,
              graphRank: r.graph_rank,
              semanticRank: r.semantic_rank
            }));
          }
        } catch (error) {
          console.error('Hybrid search failed:', error);
          // Fallback to keyword search
          results = await this.performKeywordSearch(this.currentQuery);
        }
      } else if (this.searchMode === 'semantic') {
        // Use Qdrant MCP for semantic search with local embeddings
        try {
          const qdrantResults = await mcpManager.invokeTool(
            'gaimplan-qdrant',
            'search_semantic_patterns',
            {
              description: this.currentQuery,
              limit: 20
            }
          );
          
          // Parse the results from MCP response
          if (qdrantResults && qdrantResults.content && qdrantResults.content[0]) {
            const text = qdrantResults.content[0].text;
            // Extract pattern names and scores from the response text
            const patterns = this.parseQdrantResults(text);
            
            // Load the actual note content for each pattern
            results = await this.loadNotesFromPatterns(patterns);
            
            // Only mark results as needing resolution if they don't have a valid file path
            results.forEach(r => {
              if (r.neo4j_node_id && (!r.note.path || r.note.path === r.neo4j_node_id)) {
                r.needs_resolution = true;
              }
            });
            
            // Batch resolve any node IDs
            await this.resolveNodeIds(results);
          }
        } catch (mcpError) {
          console.error('MCP search failed:', mcpError);
          // Fallback to keyword search
          results = await this.performKeywordSearch(this.currentQuery);
        }
      } else {
        // Keyword search
        results = await this.performKeywordSearch(this.currentQuery);
      }

      this.searchResults = results;
      this.displayResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      this.displayError(error.message || 'Search failed');
    }
  }

  displayResults(results) {
    const resultsContainer = this.container.querySelector('.search-results');
    
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-secondary);">
          No results found for "${this.currentQuery}"
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = results.map((result, index) => `
      <div class="search-result-item" data-index="${index}" style="
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: background 0.2s;
      ">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div style="flex: 1;">
            <div class="result-title" style="
              font-weight: 500;
              color: var(--text-primary);
              margin-bottom: 4px;
            ">${this.escapeHtml(result.note.title)}</div>
            <div class="result-path" style="
              font-size: 11px;
              color: var(--text-secondary);
              margin-bottom: 4px;
            ">${this.escapeHtml(result.note.path)}</div>
            <div class="result-preview" style="
              font-size: 12px;
              color: var(--text-secondary);
              overflow: hidden;
              text-overflow: ellipsis;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
            ">${this.escapeHtml(this.getPreview(result.note.content))}</div>
          </div>
          ${this.searchMode === 'semantic' ? `
            <div class="result-score" style="
              font-size: 11px;
              color: var(--accent-color);
              margin-left: 12px;
              white-space: nowrap;
            ">${Math.round(result.score * 100)}%</div>
          ` : ''}
          ${this.searchMode === 'hybrid' && result.matchType ? `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 4px;
              margin-left: 12px;
            ">
              <div class="match-type" style="
                font-size: 10px;
                padding: 2px 6px;
                background: ${this.getMatchTypeColor(result.matchType)};
                color: white;
                border-radius: 3px;
                text-transform: capitalize;
              ">${result.matchType}</div>
              ${result.graphRank && result.semanticRank ? `
                <div style="
                  font-size: 10px;
                  color: var(--text-secondary);
                ">G:${result.graphRank} S:${result.semanticRank}</div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    // Add hover and click handlers
    const items = resultsContainer.querySelectorAll('.search-result-item');
    items.forEach((item, index) => {
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
      
      item.addEventListener('click', () => {
        this.openResult(index);
      });
    });
  }

  displayPlaceholder() {
    const resultsContainer = this.container.querySelector('.search-results');
    resultsContainer.innerHTML = `
      <div class="search-placeholder" style="
        padding: 40px;
        text-align: center;
        color: var(--text-secondary);
      ">
        Start typing to search your notes
      </div>
    `;
  }

  displayError(error) {
    const resultsContainer = this.container.querySelector('.search-results');
    resultsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--error-color);">
        Error: ${this.escapeHtml(error)}
      </div>
    `;
  }

  getPreview(content, maxLength = 150) {
    // Remove markdown formatting for preview
    const plainText = content
      .replace(/^#+\s+/gm, '') // Headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
      .replace(/\*([^*]+)\*/g, '$1') // Italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/\n+/g, ' ') // Newlines
      .trim();
    
    return plainText.length > maxLength 
      ? plainText.substring(0, maxLength) + '...'
      : plainText;
  }

  handleKeyDown(e) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;
      
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.searchResults.length - 1);
        this.updateSelection();
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection();
        break;
      
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.openResult(this.selectedIndex);
        }
        break;
    }
  }

  updateSelection() {
    const items = this.container.querySelectorAll('.search-result-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.style.background = 'var(--bg-hover)';
      } else {
        item.style.background = 'transparent';
      }
    });

    // Scroll selected item into view
    if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
      items[this.selectedIndex].scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }

  async openResult(index) {
    const result = this.searchResults[index];
    if (!result) return;

    try {
      let filePath = result.note.path;
      
      // Check if this is a neo4j node ID that needs resolution
      if (result.needs_resolution && filePath && !filePath.includes('/') && !filePath.includes('.')) {
        // This looks like a node ID, resolve it
        const resolvedPath = await invoke('resolve_node_id_to_path', { nodeId: filePath });
        if (resolvedPath) {
          filePath = resolvedPath;
        } else {
          console.error('Could not resolve node ID to path:', filePath);
          alert(`Could not find file for node ID: ${filePath}`);
          return;
        }
      }
      
      // Open the note in the editor
      await window.openFile(filePath);
      this.hide();
    } catch (error) {
      console.error('Failed to open file:', error);
      alert(`Failed to open file: ${error.message || error}`);
    }
  }

  show() {
    if (!this.container) {
      this.mount();
    }
    
    this.container.style.display = 'block';
    this.isVisible = true;
    this.selectedIndex = -1;
    
    // Focus search input
    const input = this.container.querySelector('.search-input');
    if (input) {
      input.focus();
      input.select();
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
    }
    this.isVisible = false;
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  getMatchTypeColor(matchType) {
    const colors = {
      'direct': '#4CAF50',      // Green for direct matches
      'tagged': '#2196F3',      // Blue for tag matches
      'linked': '#FF9800',      // Orange for linked notes
      'related': '#9C27B0',     // Purple for related notes
      'semantic': '#00BCD4',    // Cyan for semantic matches
      'hybrid': '#F44336'       // Red for hybrid matches
    };
    return colors[matchType.toLowerCase()] || '#757575';
  }
  
  parseQdrantResults(responseText) {
    const patterns = [];
    
    // Parse the MCP response text to extract pattern information
    const lines = responseText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for similarity scores
      if (line.includes('Similarity:')) {
        const scoreMatch = line.match(/Similarity:\s*([\d.]+)/);
        if (scoreMatch) {
          const score = parseFloat(scoreMatch[1]);
          let name = '';
          let neo4j_node_id = null;
          let file_path = null;
          
          // Look for pattern details in the following lines
          for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
            const detailLine = lines[j];
            
            // Extract pattern name
            const patternMatch = detailLine.match(/•\s*Pattern:\s*(.+)/);
            if (patternMatch) {
              name = patternMatch[1].trim();
            }
            
            // Extract Neo4j ID
            const idMatch = detailLine.match(/•\s*Neo4j ID:\s*(\S+)/);
            if (idMatch && idMatch[1] !== 'none') {
              neo4j_node_id = idMatch[1].trim();
            }
            
            // Extract file path
            const pathMatch = detailLine.match(/•\s*File Path:\s*(.+)/);
            if (pathMatch && pathMatch[1] !== 'none') {
              file_path = pathMatch[1].trim();
            }
          }
          
          if (name || neo4j_node_id || file_path) {
            patterns.push({ name, score, neo4j_node_id, file_path });
          }
        }
      }
    }
    
    return patterns;
  }
  
  async loadNotesFromPatterns(patterns) {
    const results = [];
    
    // Get the file tree to find notes by name
    try {
      const fileTree = await invoke('get_file_tree');
      const files = this.flattenFileTree(fileTree);
      
      for (const pattern of patterns) {
        // If we have a file_path from Qdrant, use it directly
        if (pattern.file_path) {
          // Don't try to read content here - just pass the file path
          results.push({
            note: {
              title: pattern.name || pattern.file_path.split('/').pop().replace(/\.md$/, ''),
              path: pattern.file_path,
              content: '' // Content will be loaded when file is opened
            },
            score: pattern.score,
            neo4j_node_id: pattern.neo4j_node_id,
            needs_resolution: false // We have the file path, no resolution needed
          });
        } else if (pattern.neo4j_node_id) {
          // If we only have neo4j_node_id, mark for resolution
          results.push({
            note: {
              title: pattern.name || 'Untitled',
              path: pattern.neo4j_node_id, // This will be resolved later
              content: `Pattern: ${pattern.name || 'Unknown'}`
            },
            score: pattern.score,
            neo4j_node_id: pattern.neo4j_node_id,
            needs_resolution: true
          });
        } else {
          // Fall back to finding by name
          const file = files.find(f => {
            const fileName = f.name.replace(/\.md$/, '');
            return fileName === pattern.name || 
                   fileName.toLowerCase() === pattern.name.toLowerCase();
          });
          
          if (file) {
            try {
              const content = await invoke('read_file_content', { 
                filePath: file.path 
              });
              
              results.push({
                note: {
                  title: pattern.name,
                  path: file.path,
                  content: content
                },
                score: pattern.score
              });
            } catch (error) {
              console.error(`Failed to read file ${file.path}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
    
    return results;
  }
  
  flattenFileTree(fileTree) {
    const files = [];
    
    if (fileTree && fileTree.files) {
      for (const file of fileTree.files) {
        if (!file.is_dir && file.name.endsWith('.md')) {
          files.push(file);
        }
      }
    }
    
    return files;
  }
  
  async performKeywordSearch(query) {
    // Simple keyword search in file names and content
    const results = [];
    const queryLower = query.toLowerCase();
    
    try {
      const fileTree = await invoke('get_file_tree');
      const files = this.flattenFileTree(fileTree);
      
      for (const file of files) {
        const fileName = file.name.toLowerCase();
        
        // Check if query matches file name
        if (fileName.includes(queryLower)) {
          try {
            const content = await invoke('read_file_content', { 
              filePath: file.path 
            });
            
            results.push({
              note: {
                title: file.name.replace(/\.md$/, ''),
                path: file.path,
                content: content
              },
              score: 1.0 // File name match gets high score
            });
          } catch (error) {
            console.error(`Failed to read file ${file.path}:`, error);
          }
        }
      }
      
      // Sort by score
      results.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Keyword search failed:', error);
    }
    
    return results.slice(0, 20); // Limit to 20 results
  }

  async handleSync() {
    const syncBtn = this.container.querySelector('.sync-btn');
    const syncStatus = this.container.querySelector('.sync-status');
    
    // Disable button during sync
    syncBtn.disabled = true;
    syncBtn.style.opacity = '0.5';
    syncBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <path d="M21 12a9 9 0 11-6.219-8.56"></path>
      </svg>
      Syncing...
    `;
    
    // Add spinning animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .spin {
        animation: spin 1s linear infinite;
      }
    `;
    document.head.appendChild(style);
    
    syncStatus.style.display = 'block';
    syncStatus.textContent = 'Preparing sync...';
    
    try {
      const result = await qdrantSync.syncVaultToQdrant((progress) => {
        // Update progress in UI
        if (progress.status === 'loading_notes') {
          syncStatus.textContent = 'Loading notes from vault...';
        } else if (progress.status === 'syncing') {
          let statusParts = [];
          if (progress.successCount) statusParts.push(`✓${progress.successCount}`);
          if (progress.alreadyExistsCount) statusParts.push(`⏭️${progress.alreadyExistsCount}`);
          if (progress.errorCount) statusParts.push(`✗${progress.errorCount}`);
          
          const statusText = statusParts.length > 0 ? ` (${statusParts.join(' ')})` : '';
          syncStatus.textContent = `Syncing ${progress.current}/${progress.total}${statusText}: ${progress.currentNote || ''}`;
          if (progress.lastError) {
            syncStatus.title = `Last error: ${progress.lastError}`;
          }
        } else if (progress.status === 'completed') {
          let summaryParts = [];
          if (progress.successCount) summaryParts.push(`✓ ${progress.successCount} new`);
          if (progress.alreadyExistsCount) summaryParts.push(`⏭️ ${progress.alreadyExistsCount} existing`);
          if (progress.errorCount) summaryParts.push(`✗ ${progress.errorCount} failed`);
          
          syncStatus.textContent = summaryParts.join(', ');
          syncStatus.style.color = progress.errorCount ? 'var(--warning-color)' : 'var(--success-color)';
        } else if (progress.status === 'error') {
          syncStatus.textContent = `Error: ${progress.error}`;
          syncStatus.style.color = 'var(--error-color)';
        }
      });
      
      // Show success/failure summary
      let finalSummary = [];
      if (result.successCount) finalSummary.push(`✓ ${result.successCount} new`);
      if (result.alreadyExistsCount) finalSummary.push(`⏭️ ${result.alreadyExistsCount} existing`);
      if (result.errorCount) finalSummary.push(`✗ ${result.errorCount} failed`);
      
      syncStatus.textContent = `Sync complete: ${finalSummary.join(', ')}`;
      syncStatus.style.color = result.errorCount ? 'var(--warning-color)' : 'var(--success-color)';
      
      // Reset button after delay
      setTimeout(() => {
        syncStatus.style.display = 'none';
        syncStatus.style.color = '';
      }, 5000);
      
    } catch (error) {
      console.error('Sync failed:', error);
      syncStatus.textContent = `Error: ${error.message}`;
      syncStatus.style.color = 'var(--error-color)';
    } finally {
      // Re-enable button
      syncBtn.disabled = false;
      syncBtn.style.opacity = '1';
      syncBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        Sync
      `;
      
      // Clean up style
      style.remove();
    }
  }
  
  async performSemanticSearchMCP(query, limit = 20) {
    // Use MCP to search with local embeddings
    try {
      const qdrantStatus = mcpManager.status.get('gaimplan-qdrant');
      const isConnected = 
        (typeof qdrantStatus === 'object' && qdrantStatus.status === 'connected') ||
        (typeof qdrantStatus === 'string' && qdrantStatus === 'connected');
      
      if (!isConnected) {
        console.warn('Qdrant MCP server not connected');
        return [];
      }
      
      // Search using the MCP server
      const searchResult = await mcpManager.invokeTool(
        'gaimplan-qdrant',
        'search_semantic_patterns',
        {
          description: query,
          limit: limit
        }
      );
      
      // Parse results
      const results = [];
      if (searchResult && searchResult.content && searchResult.content[0]) {
        // The response is text format, parse it to extract patterns
        const responseText = searchResult.content[0].text;
        
        // Extract pattern information from the numbered list format
        // Format: "1. Similarity: 0.XXX\n   • Pattern: name\n   • Type: type\n   • Neo4j ID: id"
        const patternBlocks = responseText.split(/\n\n\d+\. /).slice(1); // Split by pattern number
        
        // Add the first pattern (which doesn't have \n\n before it)
        const firstMatch = responseText.match(/1\. Similarity:[\s\S]*?(?=\n\n2\.|$)/);
        if (firstMatch) {
          patternBlocks.unshift(firstMatch[0].replace(/^1\. /, ''));
        }
        
        for (const block of patternBlocks) {
          // Extract fields from each pattern block
          const scoreMatch = block.match(/Similarity: ([\d.]+)/);
          const nameMatch = block.match(/• Pattern: (.+)/);
          const typeMatch = block.match(/• Type: (.+)/);
          const domainMatch = block.match(/• Domain: (.+)/);
          const nodeIdMatch = block.match(/• Neo4j ID: (\S+)/);
          const filePathMatch = block.match(/• File Path: (.+)/);
          
          if (nodeIdMatch && nodeIdMatch[1] && nodeIdMatch[1] !== 'none') {
            // Use file path if available, otherwise use neo4j ID for resolution
            const filePath = filePathMatch && filePathMatch[1] !== 'none' ? filePathMatch[1].trim() : nodeIdMatch[1];
            const needsResolution = !filePathMatch || filePathMatch[1] === 'none';
            
            results.push({
              file_path: filePath,
              title: nameMatch ? nameMatch[1].trim() : 'Untitled',
              preview: `${typeMatch ? typeMatch[1].trim() : 'note'} - ${domainMatch ? domainMatch[1].trim() : 'general'}`,
              relevance_score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
              match_type: 'Semantic',
              semantic_score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
              neo4j_node_id: nodeIdMatch[1],
              needs_resolution: needsResolution
            });
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('MCP semantic search failed:', error);
      return [];
    }
  }
  
  async resolveNodeIds(results) {
    // Collect all node IDs that need resolution
    const nodeIdsToResolve = [];
    results.forEach(result => {
      if (result.needs_resolution && result.note.path && 
          !result.note.path.includes('/') && !result.note.path.includes('.')) {
        nodeIdsToResolve.push(result.note.path);
      }
    });
    
    if (nodeIdsToResolve.length === 0) {
      return;
    }
    
    try {
      // Batch resolve all node IDs
      const idToPathMap = await invoke('batch_resolve_node_ids', { nodeIds: nodeIdsToResolve });
      
      // Update results with resolved paths
      results.forEach(result => {
        if (result.needs_resolution && idToPathMap[result.note.path]) {
          result.note.path = idToPathMap[result.note.path];
          result.needs_resolution = false;
        }
      });
    } catch (error) {
      console.error('Failed to batch resolve node IDs:', error);
      // Continue with unresolved IDs - they'll be resolved individually on click
    }
  }
  
  fuseSearchResults(graphResults, semanticResults) {
    // Implement Reciprocal Rank Fusion (RRF) with k=60
    const k = 60;
    const fusedScores = new Map();
    const resultMap = new Map();
    
    // Process graph results
    graphResults.forEach((result, idx) => {
      const key = result.file_path;
      const rrfScore = 1.0 / (k + idx + 1);
      fusedScores.set(key, (fusedScores.get(key) || 0) + rrfScore);
      
      // Store result with graph rank
      if (!resultMap.has(key)) {
        resultMap.set(key, {
          ...result,
          graph_rank: idx + 1,
          semantic_rank: null
        });
      }
    });
    
    // Process semantic results
    semanticResults.forEach((result, idx) => {
      const key = result.file_path;
      const rrfScore = 1.0 / (k + idx + 1);
      fusedScores.set(key, (fusedScores.get(key) || 0) + rrfScore);
      
      // Store or update result with semantic rank
      if (resultMap.has(key)) {
        resultMap.get(key).semantic_rank = idx + 1;
        resultMap.get(key).semantic_score = result.semantic_score;
        // Preserve needs_resolution flag if it exists
        if (result.needs_resolution) {
          resultMap.get(key).needs_resolution = true;
        }
      } else {
        resultMap.set(key, {
          ...result,
          graph_rank: null,
          semantic_rank: idx + 1
        });
      }
    });
    
    // Convert to array and sort by RRF score
    const fusedResults = Array.from(resultMap.entries())
      .map(([key, result]) => ({
        note: {
          path: result.file_path,
          title: result.title || result.file_path.split('/').pop(),
          content: result.preview || ''
        },
        score: fusedScores.get(key),
        matchType: result.match_type || 'Hybrid',
        relationshipPath: result.relationship_path,
        graphRank: result.graph_rank,
        semanticRank: result.semantic_rank,
        rrf_score: fusedScores.get(key),
        needs_resolution: result.needs_resolution || false
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // Limit to top 20 results
    
    return fusedResults;
  }
}

// Create singleton instance
export const globalSearch = new GlobalSearch();