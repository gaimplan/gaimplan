// ChatInterface.js - Message display and input system
console.log('💬 ChatInterface loading...');

export class ChatInterface {
  constructor() {
    console.log('🔧 Initializing ChatInterface');
    this.messages = [];
    this.container = null;
    this.messagesContainer = null;
    this.inputContainer = null;
    this.onSendMessage = null;
    this.isTyping = false;
    this.currentContext = [];
    this.contextDialogOverlay = null;
    
    // Load saved messages
    this.loadMessages();
  }
  
  mount(container) {
    console.log('📌 Mounting ChatInterface');
    this.container = container;
    container.innerHTML = '';
    
    // Messages container
    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'chat-messages';
    
    // Show welcome message or render saved messages
    if (this.messages.length === 0) {
      this.showWelcomeMessage();
    } else {
      this.renderMessages();
    }
    
    // Input container
    this.inputContainer = document.createElement('div');
    this.inputContainer.className = 'chat-input-container';
    this.createInputUI();
    
    // Assemble - Input at top, messages below (Cursor style)
    container.appendChild(this.inputContainer);
    container.appendChild(this.messagesContainer);
    
    // Listen for tab changes to update context indicator
    setInterval(() => {
      this.updateContextIndicator();
    }, 1000);
  }
  
  showWelcomeMessage() {
    const welcome = document.createElement('div');
    welcome.className = 'chat-welcome';
    welcome.innerHTML = `
      <h3>Welcome to AI Chat!</h3>
      <p>I can help you understand and work with your notes.</p>
      <div class="chat-tips">
        <div class="chat-tip">
          <span class="tip-icon">📝</span>
          <span>Your current note is automatically included as context</span>
        </div>
        <div class="chat-tip">
          <span class="tip-icon">➕</span>
          <span>Click "Add Context" to include more notes in the conversation</span>
        </div>
        <div class="chat-tip">
          <span class="tip-icon">⬇️</span>
          <span>Export chats to save them permanently in "Chat History" folder</span>
        </div>
        <div class="chat-tip">
          <span class="tip-icon">📋</span>
          <span>Copy any AI response with the copy button</span>
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(welcome);
  }
  
  createInputUI() {
    // Context indicator with Add Context button
    const contextIndicator = document.createElement('div');
    contextIndicator.className = 'chat-context-indicator';
    contextIndicator.id = 'chat-context-indicator';
    this.updateContextIndicator();
    
    // Input wrapper
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'chat-input-wrapper';
    
    // Textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'chat-input';
    textarea.placeholder = 'Ask about your notes...';
    textarea.rows = 1;
    textarea.id = 'chat-input-field';
    
    // Auto-resize textarea
    textarea.addEventListener('input', (e) => {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    });
    
    // Handle enter key
    textarea.addEventListener('keydown', (e) => {
      // Send message on Enter (without Shift)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
      
      // Clear chat on Cmd/Ctrl+Shift+K
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        if (confirm('Clear chat history?')) {
          this.clearMessages();
        }
      }
      
      // Quick focus with / (when not typing)
      if (e.key === '/' && document.activeElement !== textarea) {
        e.preventDefault();
        textarea.focus();
      }
    });
    
    // Add textarea to wrapper
    inputWrapper.appendChild(textarea);
    
    // Create controls bar
    const controlsBar = document.createElement('div');
    controlsBar.className = 'chat-input-controls';
    
    // Left controls (placeholder for future features)
    const leftControls = document.createElement('div');
    leftControls.className = 'chat-input-left-controls';
    
    // Send button
    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn';
    sendBtn.title = 'Send message';
    sendBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    `;
    sendBtn.onclick = () => this.sendMessage();
    
    // Assemble controls bar
    controlsBar.appendChild(leftControls);
    controlsBar.appendChild(sendBtn);
    inputWrapper.appendChild(controlsBar);
    
    // Add context indicator to the top of the input wrapper
    inputWrapper.insertBefore(contextIndicator, inputWrapper.firstChild);
    
    // Create a wrapper div for proper alignment
    const contentWrapper = document.createElement('div');
    contentWrapper.style.width = '100%';
    contentWrapper.appendChild(inputWrapper);
    
    // Assemble input container
    this.inputContainer.appendChild(contentWrapper);
  }
  
  updateContextIndicator() {
    const indicator = document.getElementById('chat-context-indicator');
    if (!indicator) return;
    
    // Get active note from pane manager
    let activeNote = null;
    if (window.paneManager) {
      const activeTab = window.paneManager.getActiveTabManager()?.getActiveTab();
      if (activeTab && activeTab.title) {
        activeNote = {
          title: activeTab.title,
          path: activeTab.filePath
        };
      }
    }
    
    // Combine active note with additional context
    const allContext = [];
    if (activeNote) {
      allContext.push(activeNote);
    }
    allContext.push(...this.currentContext);
    
    // Always show the indicator so Add Context button is visible
    indicator.style.display = 'flex';
    indicator.innerHTML = '';
    
    // Add Context button
    const addContextBtn = document.createElement('button');
    addContextBtn.className = 'add-context-btn';
    addContextBtn.innerHTML = '+ Add Context';
    addContextBtn.onclick = () => this.showContextDialog();
    indicator.appendChild(addContextBtn);
    
    // Show context pills
    allContext.forEach((note, index) => {
      const pill = document.createElement('div');
      pill.className = 'context-pill';
      if (index === 0 && activeNote) {
        pill.classList.add('active-note');
      }
      
      const isActiveNote = index === 0 && activeNote;
      const displayName = note.title || note.name || 'Untitled';
      
      pill.innerHTML = `
        <span>${displayName}</span>
        ${isActiveNote ? '' : '<button class="remove-context" data-path="' + note.path + '">×</button>'}
      `;
      
      // Remove handler (only for non-active notes)
      if (!isActiveNote) {
        const removeBtn = pill.querySelector('.remove-context');
        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeFromContext(note.path);
          };
        }
      }
      
      indicator.appendChild(pill);
    });
  }
  
  updateContext(context) {
    console.log('📎 Updating context:', context);
    this.currentContext = context;
    this.updateContextIndicator();
  }
  
  removeFromContext(path) {
    console.log('🗑️ Removing from context:', path);
    this.currentContext = this.currentContext.filter(note => note.path !== path);
    this.updateContextIndicator();
    
    // Also remove from context manager
    if (window.chatContextManager) {
      window.chatContextManager.removeNote(path);
    }
  }
  
  showContextDialog() {
    console.log('📋 Showing context dialog');
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'context-dialog-overlay';
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.closeContextDialog();
      }
    };
    
    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'context-dialog';
    
    // Dialog header
    const header = document.createElement('div');
    header.className = 'context-dialog-header';
    header.innerHTML = `
      <h3>Add Context</h3>
      <button class="context-dialog-close" onclick="window.chatInterface.closeContextDialog()">×</button>
    `;
    
    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'context-search-input';
    searchInput.placeholder = 'Type to search notes...';
    searchInput.autofocus = true;
    
    // Results container
    const resultsContainer = document.createElement('div');
    resultsContainer.className = 'context-search-results';
    resultsContainer.id = 'context-search-results';
    
    // Set up search
    searchInput.addEventListener('input', async (e) => {
      const query = e.target.value.trim();
      await this.searchForContext(query, resultsContainer);
    });
    
    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(searchInput);
    dialog.appendChild(resultsContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Store reference for closing
    this.contextDialogOverlay = overlay;
    window.chatInterface = this; // Make available for onclick
    
    // Initial search with empty query to show recent files
    this.searchForContext('', resultsContainer);
  }
  
  closeContextDialog() {
    if (this.contextDialogOverlay) {
      this.contextDialogOverlay.remove();
      this.contextDialogOverlay = null;
    }
  }
  
  async searchForContext(query, resultsContainer) {
    try {
      const results = await window.chatContextManager.searchNotes(query);
      
      resultsContainer.innerHTML = '';
      
      if (results.length === 0) {
        resultsContainer.innerHTML = '<div class="no-results">No notes found</div>';
        return;
      }
      
      results.forEach(note => {
        const resultItem = document.createElement('div');
        resultItem.className = 'context-result-item';
        
        const displayName = note.name.replace('.md', '');
        const path = note.path.split('/').slice(0, -1).join('/') || 'root';
        
        resultItem.innerHTML = `
          <div class="result-name">${displayName}</div>
          <div class="result-path">${path}</div>
        `;
        
        resultItem.onclick = () => {
          this.addNoteToContext(note);
          this.closeContextDialog();
        };
        
        resultsContainer.appendChild(resultItem);
      });
    } catch (error) {
      console.error('Error searching notes:', error);
      resultsContainer.innerHTML = '<div class="error">Error searching notes</div>';
    }
  }
  
  addNoteToContext(note) {
    console.log('📎 Adding note to context:', note);
    
    // Check if already in context
    const exists = this.currentContext.find(n => n.path === note.path);
    if (!exists) {
      this.currentContext.push({
        name: note.name,
        path: note.path,
        title: note.name.replace('.md', '')
      });
      this.updateContextIndicator();
      
      // Add to context manager
      if (window.chatContextManager) {
        window.chatContextManager.addNote(note.path, note.name);
      }
    }
  }
  
  
  sendMessage() {
    const textarea = document.getElementById('chat-input-field');
    const message = textarea.value.trim();
    
    if (!message) return;
    
    console.log('📤 Sending message:', message);
    
    // Clear input
    textarea.value = '';
    textarea.style.height = 'auto';
    
    
    // Hide welcome message if present
    const welcome = this.messagesContainer.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Notify parent
    if (this.onSendMessage) {
      this.onSendMessage(message);
    }
  }
  
  addMessage(message) {
    console.log('➕ Adding message:', message.type);
    
    // Hide typing indicator if this is an assistant message
    if (message.type === 'assistant') {
      this.hideTyping();
    }
    
    this.messages.push(message);
    
    // For newest-at-top display, we need to prepend the new message
    const messageEl = this.createMessageElement(message);
    this.messagesContainer.insertBefore(messageEl, this.messagesContainer.firstChild);
    
    this.scrollToTop();
    
    // Save messages after adding (skip typing indicators and context)
    if (message.type !== 'typing' && message.type !== 'context') {
      this.saveMessages();
    }
  }
  
  addElement(element) {
    console.log('➕ Adding custom element to chat');
    
    // Insert the element at the top (newest first)
    this.messagesContainer.insertBefore(element, this.messagesContainer.firstChild);
    this.scrollToTop();
  }
  
  updateMessage(messageId, newContent) {
    // Find message in array
    const messageIndex = this.messages.findIndex(m => m.id === messageId);
    if (messageIndex !== -1) {
      this.messages[messageIndex].content = newContent;
      
      // Update DOM element
      const messageEl = document.querySelector(`[data-message-id="${messageId}"] .message-content`);
      if (messageEl) {
        // Handle markdown formatting with smooth update
        messageEl.innerHTML = this.parseMarkdown(newContent);
        
        // Add cursor for streaming effect
        if (!messageEl.querySelector('.streaming-cursor')) {
          const cursor = document.createElement('span');
          cursor.className = 'streaming-cursor';
          cursor.textContent = '▊';
          messageEl.appendChild(cursor);
        }
        
        // For newest-at-top, we don't need to scroll during updates
        // The user can naturally scroll down as they read
      }
    }
  }
  
  
  finalizeStreamingMessage(messageId) {
    // Remove streaming cursor
    const messageEl = document.querySelector(`[data-message-id="${messageId}"] .streaming-cursor`);
    if (messageEl) {
      messageEl.remove();
    }
    
    // Save after streaming completes
    this.saveMessages();
  }
  
  createMessageElement(message) {
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message chat-message-${message.type}`;
    if (message.id) {
      messageEl.setAttribute('data-message-id', message.id);
    }
    
    // Header with avatar and timestamp
    const header = document.createElement('div');
    header.className = 'message-header';
    
    // Avatar with timestamp
    const avatarText = message.type === 'user' ? 'You' : 
                      message.type === 'assistant' ? 'AI' : 
                      message.type === 'error' ? 'Error' : 
                      message.type === 'context' ? 'Context' : '?';
    
    const timeString = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : '';
    
    header.innerHTML = `<span class="message-avatar">${avatarText}</span>${timeString ? ` <span class="message-timestamp">${timeString}</span>` : ''}`;
    
    // Content
    const content = document.createElement('div');
    content.className = 'message-content';
    
    // Handle markdown formatting
    if (message.type === 'assistant') {
      // Simple markdown parsing
      content.innerHTML = this.parseMarkdown(message.content);
    } else if (message.type === 'context') {
      // Style context messages differently
      const isMentioned = message.content.includes('(mentioned)');
      content.innerHTML = `<span class="context-label${isMentioned ? ' context-mentioned' : ''}">${message.content}</span>`;
    } else {
      content.textContent = message.content;
    }
    
    // Assemble
    messageEl.appendChild(header);
    messageEl.appendChild(content);
    
    // Add copy button for assistant messages
    if (message.type === 'assistant') {
      const actionsBar = document.createElement('div');
      actionsBar.className = 'message-actions-bar';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'message-copy-btn';
      copyBtn.title = 'Copy response';
      copyBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span>Copy</span>
      `;
      
      copyBtn.onclick = async () => {
        try {
          // Copy the raw markdown content
          await navigator.clipboard.writeText(message.content);
          
          // Visual feedback
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Copied!</span>
          `;
          copyBtn.classList.add('copied');
          
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      };
      
      actionsBar.appendChild(copyBtn);
      messageEl.appendChild(actionsBar);
    }
    
    return messageEl;
  }
  
  renderMessage(message) {
    // Safety check - ensure container exists
    if (!this.messagesContainer) {
      console.warn('⚠️ Messages container not ready, skipping render');
      return;
    }
    
    const messageEl = this.createMessageElement(message);
    this.messagesContainer.appendChild(messageEl);
  }
  
  parseMarkdown(text) {
    // Enhanced markdown parsing with code blocks
    let parsed = text;
    
    // Code blocks with syntax highlighting
    parsed = parsed.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'plaintext';
      const escaped = this.escapeHtml(code.trim());
      return `<pre class="code-block"><code class="language-${language}">${escaped}</code></pre>`;
    });
    
    // Inline code
    parsed = parsed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    
    // Bold
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Links
    parsed = parsed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Lists
    parsed = parsed.replace(/^\* (.+)$/gm, '<li>$1</li>');
    parsed = parsed.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Line breaks
    parsed = parsed.replace(/\n/g, '<br>');
    
    return parsed;
  }
  
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
  
  renderMessages() {
    this.messagesContainer.innerHTML = '';
    // Render messages in reverse order so newest appear at top
    this.messages.slice().reverse().forEach(msg => this.renderMessage(msg));
    this.scrollToTop();
  }
  
  showTyping(isOllama = false) {
    if (this.isTyping) return;
    
    console.log('⌨️ Showing typing indicator');
    this.isTyping = true;
    this.typingStartTime = Date.now();
    
    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message chat-message-assistant';
    typingEl.id = 'typing-indicator';
    
    // Header with avatar and timestamp
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = '<span class="message-avatar">AI</span> <span class="message-timestamp">' + new Date().toLocaleTimeString() + '</span>';
    
    // Content
    const content = document.createElement('div');
    content.className = 'message-content thinking';
    content.textContent = 'Thinking...';
    
    // If Ollama, set up extended status updates
    if (isOllama) {
      this.typingInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.typingStartTime) / 1000);
        if (elapsed > 10 && elapsed <= 30) {
          content.textContent = 'Processing... This may take a moment with local models.';
        } else if (elapsed > 30 && elapsed <= 60) {
          content.textContent = 'Still processing... Large responses can take up to a minute.';
        } else if (elapsed > 60) {
          content.textContent = `Still processing... (${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed). Ollama may need more time for complex responses.`;
        }
      }, 5000); // Update every 5 seconds
    }
    
    // Assemble
    typingEl.appendChild(header);
    typingEl.appendChild(content);
    
    // Insert at the top for newest-first display
    this.messagesContainer.insertBefore(typingEl, this.messagesContainer.firstChild);
    this.scrollToTop();
  }
  
  hideTyping() {
    console.log('✋ Hiding typing indicator');
    this.isTyping = false;
    
    // Clear the interval if it exists
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
    
    const typingEl = document.getElementById('typing-indicator');
    if (typingEl) {
      typingEl.remove();
    }
  }
  
  clearMessages() {
    console.log('🗑️ Clearing all messages');
    this.messages = [];
    this.renderMessages();
    this.showWelcomeMessage();
    
    // Clear from localStorage
    localStorage.removeItem('gaimplan-chat-messages');
  }
  
  getMessages() {
    return this.messages;
  }
  
  scrollToTop() {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = 0;
      }
    }, 10);
  }
  
  scrollToBottom() {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      }
    }, 10);
  }
  
  // Persistence methods
  saveMessages() {
    try {
      const toSave = this.messages.map(msg => ({
        ...msg,
        // Don't save typing indicators
        type: msg.type === 'typing' ? null : msg.type
      })).filter(msg => msg.type);
      
      localStorage.setItem('gaimplan-chat-messages', JSON.stringify(toSave));
      console.log('💾 Saved', toSave.length, 'messages');
    } catch (error) {
      console.error('❌ Failed to save messages:', error);
    }
  }
  
  loadMessages() {
    try {
      const saved = localStorage.getItem('gaimplan-chat-messages');
      if (saved) {
        this.messages = JSON.parse(saved);
        console.log('📚 Loaded', this.messages.length, 'messages');
      }
    } catch (error) {
      console.error('❌ Failed to load messages:', error);
      this.messages = [];
    }
  }
  
  
}