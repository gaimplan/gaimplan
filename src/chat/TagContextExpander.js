// TagContextExpander.js - AI-first tag detection and context expansion
console.log('🏷️ TagContextExpander loading...');

import { mcpToolHandler } from '../mcp/MCPToolHandler.js';
import { markdownUtils } from '../editor/markdown-extensions.js';

export class TagContextExpander {
    constructor() {
        console.log('🔧 Initializing TagContextExpander');
        this.tagCache = new Map(); // Cache tag search results
        this.isEnabled = true;
    }
    
    // Extract tags from user message
    extractMessageTags(message) {
        const tags = markdownUtils.extractTags(message);
        console.log('📝 Extracted tags from message:', tags);
        return tags;
    }
    
    // Extract tags from current context notes
    extractContextTags(contextNotes) {
        const allTags = [];
        
        contextNotes.forEach(note => {
            if (note.content) {
                const tags = markdownUtils.extractTags(note.content);
                tags.forEach(tag => {
                    allTags.push({
                        tag: tag.tag,
                        source: note.title,
                        position: tag.startPos
                    });
                });
            }
        });
        
        console.log('📎 Extracted tags from context:', allTags);
        return allTags;
    }
    
    // Find related tags based on user message and context
    async findRelatedTags(message, contextNotes) {
        if (!this.isEnabled) return [];
        
        console.log('🔍 Finding related tags for message:', message);
        
        const relatedTags = [];
        
        // 1. Extract explicit tags from message
        const messageTags = this.extractMessageTags(message);
        relatedTags.push(...messageTags.map(t => ({ tag: t.tag, source: 'message', confidence: 'high' })));
        
        // 2. Extract tags from current context
        const contextTags = this.extractContextTags(contextNotes);
        relatedTags.push(...contextTags.map(t => ({ tag: t.tag, source: 'context', confidence: 'medium' })));
        
        // 3. Infer tags from message content (simple keyword matching)
        const inferredTags = await this.inferTagsFromContent(message);
        relatedTags.push(...inferredTags.map(t => ({ tag: t, source: 'inferred', confidence: 'low' })));
        
        // Remove duplicates
        const uniqueTags = [];
        const seen = new Set();
        
        for (const tagInfo of relatedTags) {
            if (!seen.has(tagInfo.tag)) {
                seen.add(tagInfo.tag);
                uniqueTags.push(tagInfo);
            }
        }
        
        console.log('🎯 Found related tags:', uniqueTags);
        return uniqueTags;
    }
    
    // Infer tags from message content using keyword matching
    async inferTagsFromContent(message) {
        const keywords = {
            'meeting': ['meeting', 'discussion', 'call', 'conference'],
            'project': ['project', 'task', 'deliverable', 'milestone'],
            'ideas': ['idea', 'brainstorm', 'concept', 'thought'],
            'research': ['research', 'study', 'analysis', 'investigate'],
            'strategy': ['strategy', 'plan', 'approach', 'roadmap'],
            'technical': ['code', 'development', 'programming', 'technical'],
            'design': ['design', 'ui', 'ux', 'interface', 'visual'],
            'client': ['client', 'customer', 'user', 'stakeholder']
        };
        
        const lowerMessage = message.toLowerCase();
        const inferredTags = [];
        
        for (const [tag, words] of Object.entries(keywords)) {
            if (words.some(word => lowerMessage.includes(word))) {
                inferredTags.push(tag);
            }
        }
        
        console.log('💡 Inferred tags from content:', inferredTags);
        return inferredTags;
    }
    
    // Search for notes containing related tags
    async searchTaggedNotes(tags) {
        if (!this.isEnabled || tags.length === 0) return [];
        
        console.log('🔍 Searching for notes with tags:', tags);
        
        try {
            const tagNames = tags.map(t => typeof t === 'string' ? t : t.tag);
            
            // Use MCP search_by_tag tool
            const searchResults = await mcpToolHandler.invokeTool('search_by_tag', {
                tags: tagNames,
                match_all: false // OR matching - find notes with any of these tags
            });
            
            console.log('📊 Tag search results:', searchResults);
            return searchResults || [];
        } catch (error) {
            console.error('❌ Error searching tagged notes:', error);
            return [];
        }
    }
    
    // Get contextual notes based on tags
    async getTagBasedContext(message, currentContext) {
        if (!this.isEnabled) return [];
        
        console.log('🎯 Getting tag-based context for message:', message);
        
        try {
            // Find related tags
            const relatedTags = await this.findRelatedTags(message, currentContext);
            
            if (relatedTags.length === 0) {
                console.log('📝 No related tags found');
                return [];
            }
            
            // Search for notes with these tags
            const taggedNotes = await this.searchTaggedNotes(relatedTags);
            
            // Filter out notes already in current context
            const currentNotePaths = new Set(currentContext.map(note => note.path));
            const newContextNotes = taggedNotes.filter(note => 
                !currentNotePaths.has(note.file)
            );
            
            console.log('📎 Found new context notes via tags:', newContextNotes.length);
            return newContextNotes;
            
        } catch (error) {
            console.error('❌ Error getting tag-based context:', error);
            return [];
        }
    }
    
    // Create AI prompt enhancement with tag context
    createTagContextPrompt(relatedTags, taggedNotes) {
        if (!this.isEnabled || relatedTags.length === 0) return '';
        
        let prompt = '\n\n=== TAG CONTEXT ===\n';
        
        // Add tag information
        if (relatedTags.length > 0) {
            prompt += `Related tags detected: ${relatedTags.map(t => `#${t.tag}`).join(', ')}\n`;
        }
        
        // Add tagged notes summary
        if (taggedNotes.length > 0) {
            prompt += `\nNotes with related tags (${taggedNotes.length} found):\n`;
            taggedNotes.slice(0, 5).forEach(note => {
                prompt += `- ${note.file}: tags [${note.tags.join(', ')}]\n`;
            });
            
            if (taggedNotes.length > 5) {
                prompt += `... and ${taggedNotes.length - 5} more notes\n`;
            }
        }
        
        prompt += '\nUse this tag context to provide more relevant and connected responses.\n';
        
        return prompt;
    }
    
    // Main method: enhance AI conversation with tag context
    async enhanceConversationWithTags(message, currentContext) {
        if (!this.isEnabled) return null;
        
        console.log('🚀 Enhancing conversation with tag context');
        
        try {
            // Find related tags
            const relatedTags = await this.findRelatedTags(message, currentContext);
            
            if (relatedTags.length === 0) {
                console.log('📝 No tags found, skipping tag enhancement');
                return null;
            }
            
            // Search for additional context
            const taggedNotes = await this.searchTaggedNotes(relatedTags);
            
            // Create enhancement info
            const enhancement = {
                relatedTags,
                taggedNotes,
                contextPrompt: this.createTagContextPrompt(relatedTags, taggedNotes),
                additionalContext: taggedNotes.slice(0, 3) // Limit to 3 additional notes
            };
            
            console.log('✨ Tag enhancement created:', enhancement);
            return enhancement;
            
        } catch (error) {
            console.error('❌ Error enhancing conversation with tags:', error);
            return null;
        }
    }
    
    // Enable/disable tag context expansion
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log('🏷️ Tag context expansion:', enabled ? 'enabled' : 'disabled');
    }
}

// Export singleton instance
export const tagContextExpander = new TagContextExpander();