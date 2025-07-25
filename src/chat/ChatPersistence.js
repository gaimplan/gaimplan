// ChatPersistence.js - Save/load chat history
console.log('💾 ChatPersistence loading...');

export class ChatPersistence {
  constructor() {
    console.log('🔧 Initializing ChatPersistence');
    this.storageKey = 'gaimplan-chat-history';
    this.maxMessages = 1000; // Limit stored messages
  }
  
  saveHistory(data) {
    console.log('💾 Saving chat history');
    
    try {
      // Limit messages to prevent excessive storage
      if (data.messages && data.messages.length > this.maxMessages) {
        data.messages = data.messages.slice(-this.maxMessages);
      }
      
      const historyData = {
        ...data,
        lastSaved: new Date().toISOString()
      };
      
      localStorage.setItem(this.storageKey, JSON.stringify(historyData));
      console.log('✅ Chat history saved');
      
    } catch (error) {
      console.error('❌ Error saving chat history:', error);
      
      // If storage is full, try to clear old data
      if (error.name === 'QuotaExceededError') {
        console.log('⚠️ Storage full, clearing old messages');
        this.clearOldMessages();
        
        // Try again with reduced data
        try {
          const reducedData = {
            messages: data.messages.slice(-100), // Keep only last 100
            lastSaved: new Date().toISOString()
          };
          localStorage.setItem(this.storageKey, JSON.stringify(reducedData));
        } catch (retryError) {
          console.error('❌ Still unable to save:', retryError);
        }
      }
    }
  }
  
  loadHistory() {
    console.log('📚 Loading chat history');
    
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        console.log(`✅ Loaded ${data.messages?.length || 0} messages`);
        return data;
      }
    } catch (error) {
      console.error('❌ Error loading chat history:', error);
    }
    
    return null;
  }
  
  clearHistory() {
    console.log('🗑️ Clearing chat history');
    localStorage.removeItem(this.storageKey);
  }
  
  clearOldMessages() {
    try {
      const history = this.loadHistory();
      if (history && history.messages) {
        // Keep only recent messages
        const recentMessages = history.messages.slice(-100);
        this.saveHistory({ messages: recentMessages });
      }
    } catch (error) {
      console.error('❌ Error clearing old messages:', error);
    }
  }
  
  exportHistory() {
    console.log('📥 Exporting chat history');
    const history = this.loadHistory();
    
    if (!history || !history.messages) {
      return null;
    }
    
    // Format as markdown
    let markdown = '# Chat History Export\n\n';
    markdown += `**Exported on:** ${new Date().toLocaleString()}\n\n`;
    markdown += '---\n\n';
    
    history.messages.forEach(msg => {
      const time = new Date(msg.timestamp).toLocaleString();
      
      if (msg.type === 'user') {
        markdown += `### You (${time})\n`;
      } else if (msg.type === 'assistant') {
        markdown += `### AI Assistant (${time})\n`;
      } else if (msg.type === 'error') {
        markdown += `### Error (${time})\n`;
      }
      
      markdown += `${msg.content}\n\n`;
    });
    
    return markdown;
  }
  
  getMessageCount() {
    const history = this.loadHistory();
    return history?.messages?.length || 0;
  }
  
  getStorageSize() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        // Calculate approximate size in KB
        const sizeInBytes = new Blob([saved]).size;
        return (sizeInBytes / 1024).toFixed(2) + ' KB';
      }
    } catch (error) {
      console.error('❌ Error calculating storage size:', error);
    }
    
    return '0 KB';
  }
}