// ContextManager.js - @ function and context management
console.log('📎 ContextManager loading...');

export class ContextManager {
  constructor() {
    console.log('🔧 Initializing ContextManager');
    this.context = [];
    this.onContextChanged = null;
    this.container = null;
    this.activeNote = null;
    
    // Auto-add active note on initialization
    this.addActiveNoteToContext();
  }
  
  mount(container) {
    console.log('📌 Mounting ContextManager');
    this.container = container;
    
    // For now, context is managed through ChatInterface
    // This component will handle @ mention search
    window.chatContextManager = this;
  }
  
  addActiveNoteToContext() {
    // Get current file from global state
    if (window.currentFile) {
      console.log('📄 Adding active note to context:', window.currentFile);
      const fileName = window.currentFile.split('/').pop();
      
      this.context = [{
        path: window.currentFile,
        name: fileName,
        type: 'active',
        content: null // Will be loaded when needed
      }];
      
      this.notifyContextChange();
    }
  }
  
  async loadNoteContent(path) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const content = await invoke('read_file_content', { filePath: path });
      return content;
    } catch (error) {
      console.error('❌ Error loading note content:', error);
      return null;
    }
  }
  
  addNote(notePath, noteName) {
    console.log('➕ Adding note to context:', notePath);
    
    // Check if already in context
    if (this.context.find(n => n.path === notePath)) {
      console.log('⚠️ Note already in context');
      return;
    }
    
    this.context.push({
      path: notePath,
      name: noteName,
      type: 'manual',
      content: null
    });
    
    this.notifyContextChange();
  }
  
  removeNote(path) {
    console.log('🗑️ Removing note from context:', path);
    this.context = this.context.filter(note => note.path !== path);
    this.notifyContextChange();
  }
  
  clearContext() {
    console.log('🗑️ Clearing all context');
    this.context = [];
    
    // Re-add active note if available
    this.addActiveNoteToContext();
  }
  
  getContext() {
    return this.context;
  }
  
  async getContextWithContent() {
    console.log('📚 Loading context content');
    const contextWithContent = [];
    
    for (const note of this.context) {
      if (!note.content) {
        note.content = await this.loadNoteContent(note.path);
      }
      contextWithContent.push(note);
    }
    
    return contextWithContent;
  }
  
  notifyContextChange() {
    if (this.onContextChanged) {
      this.onContextChanged(this.context);
    }
  }
  
  // Called when active file changes
  onActiveFileChanged(filePath) {
    console.log('📝 Active file changed:', filePath);
    
    // Remove previous active note
    this.context = this.context.filter(note => note.type !== 'active');
    
    // Add new active note
    if (filePath) {
      const fileName = filePath.split('/').pop();
      this.context.unshift({
        path: filePath,
        name: fileName,
        type: 'active',
        content: null
      });
    }
    
    this.notifyContextChange();
  }
  
  // Search for notes to add via @ mention
  async searchNotes(query) {
    console.log('🔍 Searching notes for:', query);
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const fileTree = await invoke('get_file_tree');
      
      // If no query, show recent files or all files
      if (!query) {
        const allFiles = fileTree.files
          .filter(file => !file.is_dir && file.name.endsWith('.md'))
          .slice(0, 10);
        
        return allFiles.map(file => ({
          path: file.path,
          name: file.name
        }));
      }
      
      // Score-based search for better results
      const scoredResults = fileTree.files
        .filter(file => !file.is_dir && file.name.endsWith('.md'))
        .map(file => {
          const fileName = file.name.toLowerCase();
          const searchTerm = query.toLowerCase();
          let score = 0;
          
          // Exact match
          if (fileName === searchTerm + '.md') {
            score = 100;
          }
          // Starts with query
          else if (fileName.startsWith(searchTerm)) {
            score = 80;
          }
          // Contains query
          else if (fileName.includes(searchTerm)) {
            score = 50;
            // Bonus for word boundaries
            if (fileName.includes(' ' + searchTerm) || fileName.includes('-' + searchTerm)) {
              score += 20;
            }
          }
          // Fuzzy match (each character in order)
          else {
            let searchIndex = 0;
            for (let i = 0; i < fileName.length && searchIndex < searchTerm.length; i++) {
              if (fileName[i] === searchTerm[searchIndex]) {
                searchIndex++;
                score += 5;
              }
            }
            if (searchIndex !== searchTerm.length) {
              score = 0; // Didn't match all characters
            }
          }
          
          return { file, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(item => ({
          path: item.file.path,
          name: item.file.name
        }));
      
      return scoredResults;
      
    } catch (error) {
      console.error('❌ Error searching notes:', error);
      return [];
    }
  }
}