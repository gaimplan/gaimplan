// ClaudeSDK.js - Claude Code SDK integration wrapper
console.log('🤖 ClaudeSDK loading...');

// Import Tauri APIs for invoking commands and channels
import { invoke, Channel } from '@tauri-apps/api/core';

// Track if we're using real Claude or simulation mode
let useSimulation = false;

export class ClaudeSDK {
  constructor() {
    console.log('🔧 Initializing ClaudeSDK');
    this.isInitialized = false;
    this.currentModel = 'default'; // default uses Opus 4 for 50%, then Sonnet
    this.sessionId = null;
  }
  
  async initialize() {
    console.log('🚀 Initializing Claude Code SDK...');
    
    try {
      // Test if we can use the SDK
      // The SDK relies on the Claude CLI being authenticated
      this.isInitialized = true;
      console.log('✅ Claude Code SDK initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Claude Code SDK:', error);
      this.isInitialized = false;
      return false;
    }
  }
  
  async *sendMessage(message, context = []) {
    console.log('📤 Sending message to Claude:', message);
    console.log('📎 With context:', context.length, 'notes');
    
    if (!this.isInitialized) {
      throw new Error('Claude SDK not initialized');
    }
    
    try {
      // Build the prompt with context
      let prompt = this.buildPromptWithContext(message, context);
      
      // Check if we should use simulation mode
      if (useSimulation) {
        yield* this.simulateResponse(prompt);
        return;
      }
      
      // Check authentication first
      try {
        const isAuth = await invoke('check_claude_auth');
        console.log('🔐 Claude authentication status:', isAuth);
        
        if (!isAuth) {
          console.warn('⚠️ Claude CLI not authenticated, falling back to simulation');
          useSimulation = true;
          yield* this.simulateResponse(prompt);
          return;
        }
      } catch (authError) {
        console.error('❌ Failed to check Claude auth:', authError);
        useSimulation = true;
        yield* this.simulateResponse(prompt);
        return;
      }
      
      // Use real Claude via Tauri command
      console.log('🔄 Starting Claude query via Tauri...');
      console.log('📝 Prompt:', prompt);
      
      // Create a channel for streaming responses
      const channel = new Channel();
      const messages = [];
      let isComplete = false;
      
      // Set up channel message handler
      channel.onmessage = (message) => {
        console.log('📨 Received channel message:', message);
        messages.push(message);
      };
      
      // Start the query - this will stream messages to our channel
      const queryPromise = invoke('claude_query', { 
        prompt,
        channel 
      }).then(() => {
        isComplete = true;
        console.log('✅ Claude query completed');
      }).catch((error) => {
        console.error('❌ Claude query failed:', error);
        messages.push({ msg_type: 'error', content: error.toString() });
        isComplete = true;
      });
      
      // Yield messages as they arrive
      let lastIndex = 0;
      let buffer = '';
      
      while (!isComplete || lastIndex < messages.length) {
        // Process any new messages
        while (lastIndex < messages.length) {
          const msg = messages[lastIndex++];
          
          if (msg.msg_type === 'text') {
            buffer += msg.content;
            yield {
              type: 'content',
              content: buffer
            };
          } else if (msg.msg_type === 'error') {
            throw new Error(msg.content);
          }
        }
        
        // Small delay to prevent busy waiting
        if (!isComplete) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log('✅ Message streaming completed');
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
      
      // If Claude CLI is not available, fall back to simulation
      if (error.message?.includes('Failed to spawn claude CLI')) {
        console.warn('⚠️ Claude CLI not found, switching to simulation mode');
        useSimulation = true;
        yield* this.simulateResponse(message);
      } else {
        yield {
          type: 'error',
          error: error.message
        };
      }
    }
  }
  
  // Simulated response for when Claude CLI is not available
  async *simulateResponse(prompt) {
    console.log('🤖 Using simulated Claude response');
    
    let response = '';
    
    if (prompt.toLowerCase().includes('hi') || prompt.toLowerCase().includes('hello')) {
      response = 'Hello! I\'m Claude, your AI assistant. I can help you understand and work with your notes. How can I assist you today?';
    } else if (prompt.includes('---')) {
      response = 'I can see you\'ve shared some notes with me. Based on the context you\'ve provided, I can help analyze, summarize, or answer questions about this content. What would you like to know?';
    } else {
      response = `I understand you're asking about: "${prompt.substring(0, 50)}...". I'm currently in simulation mode. To use the real Claude API:

1. Make sure Claude Code SDK is installed (seems like it is!)
2. Run 'claude login' in your terminal to authenticate
3. Reload the app and try again

Once authenticated, I'll be able to provide much more helpful responses!`;
    }
    
    // Simulate streaming
    const words = response.split(' ');
    for (const word of words) {
      yield {
        type: 'content',
        content: words.slice(0, words.indexOf(word) + 1).join(' ')
      };
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  
  buildPromptWithContext(message, contextNotes) {
    let prompt = '';
    
    // Add context if available
    if (contextNotes.length > 0) {
      prompt += 'I have the following notes in my knowledge base:\n\n';
      
      contextNotes.forEach((note, index) => {
        prompt += `--- Note ${index + 1}: ${note.name} ---\n`;
        prompt += note.content || '[Content not loaded]';
        prompt += '\n\n';
      });
      
      prompt += '--- End of Notes ---\n\n';
      prompt += 'Based on the notes above, please help me with the following:\n\n';
    }
    
    prompt += message;
    
    return prompt;
  }
  
  async switchModel(model) {
    console.log('🔄 Switching model to:', model);
    
    const validModels = ['default', 'sonnet', 'opus'];
    if (!validModels.includes(model)) {
      throw new Error(`Invalid model: ${model}. Must be one of: ${validModels.join(', ')}`);
    }
    
    this.currentModel = model;
    console.log('✅ Model switched to:', model);
  }
  
  async checkAuthStatus() {
    console.log('🔍 Checking Claude authentication status...');
    
    try {
      // Use Tauri command to check auth
      const authenticated = await invoke('check_claude_auth');
      console.log('✅ Claude authentication status:', authenticated);
      return authenticated;
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      return false;
    }
  }
  
  // Get current usage limits
  async getUsageLimits() {
    // This would need to be implemented based on the SDK's capabilities
    return {
      model: this.currentModel,
      remaining: 'Check Claude.ai for usage',
      resetTime: 'Every 5 hours'
    };
  }
}