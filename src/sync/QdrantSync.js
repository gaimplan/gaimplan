import { invoke } from '@tauri-apps/api/core';
import { mcpManager } from '../mcp/MCPManager.js';

export class QdrantSync {
  constructor() {
    this.isRunning = false;
    this.progress = {
      current: 0,
      total: 0,
      status: 'idle'
    };
  }

  /**
   * Sync all vault notes to Qdrant using local embeddings
   */
  async syncVaultToQdrant(onProgress) {
    if (this.isRunning) {
      throw new Error('Sync already in progress');
    }

    this.isRunning = true;
    this.progress = { current: 0, total: 0, status: 'preparing' };

    try {
      // Check if Qdrant MCP server is connected
      const qdrantStatus = mcpManager.status.get('gaimplan-qdrant');
      const isConnected = 
        (typeof qdrantStatus === 'object' && qdrantStatus.status === 'connected') ||
        (typeof qdrantStatus === 'string' && qdrantStatus === 'connected');
      
      if (!isConnected) {
        throw new Error('Qdrant MCP server is not connected. Please enable it in MCP settings.');
      }

      // Get all notes from the vault
      if (onProgress) onProgress({ ...this.progress, status: 'loading_notes' });
      const notes = await this.getAllNotes();
      
      this.progress.total = notes.length;
      console.log(`Found ${notes.length} notes to sync`);
      
      // Start with a clean slate - track successful syncs
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      let alreadyExistsCount = 0;

      // Process notes sequentially to avoid overwhelming MCP
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        try {
          const result = await this.syncNoteToQdrant(note);
          this.progress.current++;
          
          if (result && result.skipped) {
            skippedCount++;
            if (result.reason === 'already_exists') {
              alreadyExistsCount++;
            }
          } else {
            successCount++;
          }
          
          if (onProgress) {
            onProgress({
              ...this.progress,
              status: 'syncing',
              currentNote: note.title,
              successCount,
              errorCount,
              skippedCount,
              alreadyExistsCount
            });
          }
          
          // Small delay between notes to prevent overwhelming the MCP server
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Failed to sync note ${note.title}:`, error.message);
          
          if (error.message.includes('Insufficient content')) {
            skippedCount++;
          } else {
            errorCount++;
          }
          
          this.progress.current++;
          
          if (onProgress) {
            onProgress({
              ...this.progress,
              status: 'syncing',
              currentNote: note.title,
              successCount,
              errorCount,
              skippedCount,
              alreadyExistsCount,
              lastError: error.message
            });
          }
          
          // Longer delay after error to let system recover
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Store sync metadata
      try {
        await this.storeSyncMetadata();
      } catch (error) {
        console.error('Failed to store sync metadata:', error);
      }

      this.progress.status = 'completed';
      if (onProgress) {
        onProgress({
          ...this.progress,
          successCount,
          errorCount,
          skippedCount,
          alreadyExistsCount
        });
      }

      return {
        success: errorCount === 0,
        notesProcessed: this.progress.current,
        totalNotes: this.progress.total,
        successCount,
        errorCount,
        skippedCount,
        alreadyExistsCount
      };

    } catch (error) {
      this.progress.status = 'error';
      if (onProgress) onProgress({ ...this.progress, error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get all notes from the current vault
   */
  async getAllNotes() {
    try {
      // Get file tree from the vault
      const fileTree = await invoke('get_file_tree');
      
      // Extract all markdown files from the tree
      const markdownFiles = this.extractMarkdownFiles(fileTree);
      console.log(`Found ${markdownFiles.length} markdown files in vault`);

      // Convert file paths to note objects
      const notes = await Promise.all(markdownFiles.map(async (fileInfo) => {
        try {
          const content = await invoke('read_file_content', { 
            filePath: fileInfo.path 
          });
          
          return {
            id: await this.generateNoteId(fileInfo.path),
            path: fileInfo.path,
            title: fileInfo.name.replace(/\.md$/, ''),
            content: content
          };
        } catch (error) {
          console.error(`Failed to read file ${fileInfo.path}:`, error);
          return null;
        }
      }));

      return notes.filter(note => note !== null);
    } catch (error) {
      console.error('Failed to get vault files:', error);
      // Fallback: try to get notes from Neo4j if available
      return await this.getNotesFromNeo4j();
    }
  }

  /**
   * Extract markdown files from file tree
   */
  extractMarkdownFiles(fileTree) {
    if (!fileTree || !fileTree.files) {
      return [];
    }
    
    // FileTree contains a flat array of FileInfo objects
    return fileTree.files.filter(file => {
      // Only include files (not directories) that end with .md
      return !file.is_dir && file.name.endsWith('.md');
    });
  }

  /**
   * Fallback: Get notes from Neo4j
   */
  async getNotesFromNeo4j() {
    try {
      // This would need a proper Tauri command to get all notes
      const response = await invoke('get_all_notes_from_graph');
      return response || [];
    } catch (error) {
      console.error('Failed to get notes from Neo4j:', error);
      return [];
    }
  }

  /**
   * Sync a single note to Qdrant
   */
  async syncNoteToQdrant(note) {
    // Prepare the note data for pattern embedding
    const description = this.extractDescription(note.content);
    
    // Skip notes with very short or no content
    if (!description || description.length < 20) {
      console.log(`Skipping note with insufficient content: ${note.title}`);
      // Don't count as error, just skip
      throw new Error('Insufficient content for embedding');
    }
    
    // Clean and validate the data
    const cleanTitle = this.cleanText(note.title).substring(0, 100);
    const cleanDescription = this.cleanText(description).substring(0, 2000);
    
    // Ensure we have meaningful content for embedding
    const embeddingText = `${cleanTitle} ${cleanDescription}`.trim();
    if (embeddingText.length < 20) {
      console.log(`Skipping note with too little embedding text: ${note.title}`);
      throw new Error('Insufficient content for embedding');
    }
    
    const neo4jNodeId = note.id || await this.generateNoteId(note.path);
    
    // Check if pattern already exists
    try {
      const checkResult = await mcpManager.invokeTool(
        'gaimplan-qdrant',
        'check_pattern_exists',
        { neo4j_node_id: neo4jNodeId }
      );
      
      if (checkResult && checkResult.content && checkResult.content[0]) {
        const existenceData = JSON.parse(checkResult.content[0].text);
        if (existenceData.exists) {
          console.log(`⏭️  Note already synced: ${note.title}`);
          // Don't count as error, pattern already exists
          return { skipped: true, reason: 'already_exists' };
        }
      }
    } catch (error) {
      console.warn(`Could not check if pattern exists for ${note.title}:`, error.message);
      // Continue with sync if check fails
    }
    
    const patternData = {
      pattern_name: cleanTitle || 'Untitled',
      pattern_type: 'note',
      neo4j_node_id: neo4jNodeId,
      description: cleanDescription || cleanTitle, // Use title as fallback
      domain: this.extractDomain(note.path) || 'general',
      effectiveness_score: 0.5,
      usage_count: 0,
      // Store the file path directly for easy resolution
      file_path: note.path
    };

    // Store as pattern embedding using MCP
    const result = await mcpManager.invokeTool(
      'gaimplan-qdrant',
      'store_pattern_embedding',
      patternData
    );

    console.log(`✓ Synced note: ${note.title}`);
    return result;
  }

  /**
   * Extract a description from note content
   */
  extractDescription(content) {
    if (!content) return '';
    
    // Clean the entire content first
    let cleanContent = content
      .replace(/^#[^#\n]+$/gm, '') // Remove single # headers (often just tags)
      .replace(/^#+\s+/gm, '') // Remove other headers
      .replace(/==([^=]+)==/g, '$1') // Remove highlights
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic  
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`([^`]+)`/g, '$1') // Remove inline code
      .replace(/^-\s+/gm, '') // Remove list markers
      .replace(/^\d+\.\s+/gm, '') // Remove numbered list markers
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
      .trim();
    
    // Find the first substantial paragraph (at least 20 chars)
    const paragraphs = cleanContent.split('\n\n');
    let description = '';
    
    for (const para of paragraphs) {
      const cleaned = para.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 20) {
        description = cleaned;
        break;
      }
    }
    
    // If still no good content, use whatever we can get
    if (!description) {
      description = cleanContent.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    return description.substring(0, 2000);
  }

  /**
   * Extract domain from file path
   */
  extractDomain(path) {
    // Extract folder name as domain
    const parts = path.split('/');
    if (parts.length > 1) {
      return parts[parts.length - 2];
    }
    return 'general';
  }

  /**
   * Generate a consistent note ID from file path
   * This must match the ID generation in src-tauri/src/graph/sync.rs
   */
  async generateNoteId(filePath) {
    try {
      // Get the vault path to calculate relative path
      const vaultInfo = await invoke('get_current_vault');
      if (!vaultInfo || !vaultInfo.path) {
        throw new Error('No vault is open');
      }
      
      // Get vault ID (which includes vault path in the hash)
      const vaultId = await invoke('get_vault_id');
      
      // The backend uses SHA256(vault_id + relative_path)
      // We need to invoke a command to ensure consistent ID generation
      const nodeId = await invoke('calculate_note_id', {
        filePath: filePath,
        vaultPath: vaultInfo.path,
        vaultId: vaultId
      });
      
      return nodeId;
    } catch (error) {
      console.error('Failed to generate note ID:', error);
      // Fallback to a simple hash if the command fails
      let hash = 0;
      for (let i = 0; i < filePath.length; i++) {
        const char = filePath.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(16);
    }
  }

  /**
   * Store sync metadata
   */
  async storeSyncMetadata() {
    const metadata = {
      lastSync: new Date().toISOString(),
      notesCount: this.progress.total,
      version: '1.0'
    };

    // Store in Qdrant as a special pattern
    await mcpManager.invokeTool(
      'gaimplan-qdrant',
      'store_pattern_embedding',
      {
        pattern_name: '_sync_metadata',
        pattern_type: 'metadata',
        neo4j_node_id: 'sync_meta_1',
        description: JSON.stringify(metadata),
        domain: 'system',
        effectiveness_score: 1.0,
        usage_count: 1
      }
    );
  }
  
  /**
   * Clean text for safe storage
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/[\x00-\x1F\x7F]/g, ' ') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

// Singleton instance
export const qdrantSync = new QdrantSync();