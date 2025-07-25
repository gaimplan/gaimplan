import { syntaxTree } from '@codemirror/language'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { invoke } from '@tauri-apps/api/core'

// Wiki-link syntax [[Page Name]]
class WikiLinkWidget extends WidgetType {
  constructor(text, fullMatch) {
    super()
    this.text = text
    this.fullMatch = fullMatch
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-wikilink'
    span.textContent = this.fullMatch
    span.title = `Navigate to: ${this.text}`
    span.onclick = async () => {
      try {
        await invoke('open_note', { title: this.text })
      } catch (error) {
        console.error('Failed to open note:', error)
      }
    }
    return span
  }

  eq(other) {
    return other.text === this.text
  }
}

// Block reference syntax ^block-id
class BlockRefWidget extends WidgetType {
  constructor(id, fullMatch) {
    super()
    this.id = id
    this.fullMatch = fullMatch
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-blockref'
    span.textContent = this.fullMatch
    span.title = `Block reference: ${this.id}`
    return span
  }

  eq(other) {
    return other.id === this.id
  }
}

// Tag syntax #tag
class TagWidget extends WidgetType {
  constructor(tag, fullMatch) {
    super()
    this.tag = tag
    this.fullMatch = fullMatch
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-tag'
    span.textContent = this.fullMatch
    span.title = `Tag: ${this.tag}`
    span.onclick = async () => {
      try {
        await invoke('search_by_tag', { tag: this.tag })
      } catch (error) {
        console.error('Failed to search by tag:', error)
      }
    }
    return span
  }

  eq(other) {
    return other.tag === this.tag
  }
}

// Embedded block syntax ![[Block^id]]
class EmbeddedBlockWidget extends WidgetType {
  constructor(noteTitle, blockId, fullMatch) {
    super()
    this.noteTitle = noteTitle
    this.blockId = blockId
    this.fullMatch = fullMatch
  }

  toDOM() {
    const div = document.createElement('div')
    div.className = 'cm-embedded-block'
    
    const header = document.createElement('div')
    header.className = 'cm-embedded-block-header'
    header.textContent = `${this.noteTitle}${this.blockId ? '^' + this.blockId : ''}`
    
    const content = document.createElement('div')
    content.className = 'cm-embedded-block-content'
    content.textContent = 'Loading...'
    
    div.appendChild(header)
    div.appendChild(content)
    
    // Load the embedded content
    this.loadEmbeddedContent(content)
    
    return div
  }

  async loadEmbeddedContent(contentElement) {
    try {
      const content = await invoke('get_embedded_block', {
        noteTitle: this.noteTitle,
        blockId: this.blockId
      })
      contentElement.textContent = content || 'Block not found'
    } catch (error) {
      contentElement.textContent = 'Error loading block'
      console.error('Failed to load embedded block:', error)
    }
  }

  eq(other) {
    return other.noteTitle === this.noteTitle && other.blockId === this.blockId
  }
}

export const markdownExtensions = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.computeDecorations(view)
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.computeDecorations(update.view)
      }
    }

    computeDecorations(view) {
      const builder = new RangeSetBuilder()
      const doc = view.state.doc
      
      for (const { from, to } of view.visibleRanges) {
        // Process each line in the visible range
        for (let pos = from; pos <= to;) {
          const line = doc.lineAt(pos)
          const text = line.text
          
          // Find all patterns in the line
          this.findPatterns(text, line.from, builder)
          
          pos = line.to + 1
        }
      }
      
      return builder.finish()
    }

    findPatterns(text, lineStart, builder) {
      let pos = 0
      
      while (pos < text.length) {
        // Wiki links [[Page Name]] or [[Page Name|Display Text]]
        const wikiLinkMatch = text.slice(pos).match(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/)
        if (wikiLinkMatch && text.indexOf(wikiLinkMatch[0], pos) === pos) {
          const fullMatch = wikiLinkMatch[0]
          const noteTitle = wikiLinkMatch[1]
          const displayText = wikiLinkMatch[3] || noteTitle
          
          builder.add(
            lineStart + pos,
            lineStart + pos + fullMatch.length,
            Decoration.replace({
              widget: new WikiLinkWidget(noteTitle, `[[${displayText}]]`)
            })
          )
          
          pos += fullMatch.length
          continue
        }
        
        // Embedded blocks ![[Note^blockid]] or ![[Note]]
        const embeddedMatch = text.slice(pos).match(/!\[\[([^\]^]+)(\^([^\]]+))?\]\]/)
        if (embeddedMatch && text.indexOf(embeddedMatch[0], pos) === pos) {
          const fullMatch = embeddedMatch[0]
          const noteTitle = embeddedMatch[1]
          const blockId = embeddedMatch[3]
          
          builder.add(
            lineStart + pos,
            lineStart + pos + fullMatch.length,
            Decoration.replace({
              widget: new EmbeddedBlockWidget(noteTitle, blockId, fullMatch)
            })
          )
          
          pos += fullMatch.length
          continue
        }
        
        // Block references ^block-id (at end of line or followed by space)
        const blockRefMatch = text.slice(pos).match(/\^([a-zA-Z0-9_-]+)(?=\s|$)/)
        if (blockRefMatch && text.indexOf(blockRefMatch[0], pos) === pos) {
          const fullMatch = blockRefMatch[0]
          const blockId = blockRefMatch[1]
          
          builder.add(
            lineStart + pos,
            lineStart + pos + fullMatch.length,
            Decoration.replace({
              widget: new BlockRefWidget(blockId, fullMatch)
            })
          )
          
          pos += fullMatch.length
          continue
        }
        
        // Tags #tag and #nested/tags (must be at word boundary)
        const tagMatch = text.slice(pos).match(/(?:^|(?<=\s))#([a-zA-Z0-9_][a-zA-Z0-9_/-]*[a-zA-Z0-9_]|[a-zA-Z0-9_])(?=\s|$|[.,!?;:)])/)
        if (tagMatch && text.indexOf(tagMatch[0], pos) === pos) {
          const fullMatch = tagMatch[0]
          const tag = tagMatch[1]
          
          builder.add(
            lineStart + pos,
            lineStart + pos + fullMatch.length,
            Decoration.replace({
              widget: new TagWidget(tag, fullMatch)
            })
          )
          
          pos += fullMatch.length
          continue
        }
        
        pos++
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

// Add custom CSS for our extensions
export const markdownStyles = EditorView.theme({
  '.cm-wikilink': {
    color: 'var(--md-link-color, #3182ce)',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: '1px 2px',
    borderRadius: '2px',
    backgroundColor: 'var(--md-wikilink-bg, rgba(49, 130, 206, 0.1))',
    '&:hover': {
      color: 'var(--md-link-hover-color, #2c5282)',
      backgroundColor: 'var(--md-wikilink-hover-bg, rgba(49, 130, 206, 0.2))'
    }
  },
  '.cm-blockref': {
    color: 'var(--md-blockref-color, #8b5cf6)',
    backgroundColor: 'var(--md-blockref-bg, rgba(139, 92, 246, 0.1))',
    fontSize: '0.9em',
    padding: '1px 4px',
    borderRadius: '3px',
    fontFamily: 'monospace',
    verticalAlign: 'baseline'
  },
  '.cm-tag': {
    color: 'var(--md-tag-color, #059669)',
    backgroundColor: 'var(--md-tag-bg, #d1fae5)',
    padding: '1px 6px',
    borderRadius: '4px',
    fontSize: '0.9em',
    fontWeight: '500',
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: 'var(--md-tag-hover-bg, #a7f3d0)'
    }
  },
  '.cm-embedded-block': {
    border: '1px solid var(--md-embedded-border, #e2e8f0)',
    borderRadius: '6px',
    margin: '8px 0',
    backgroundColor: 'var(--md-embedded-bg, #f8fafc)',
    overflow: 'hidden'
  },
  '.cm-embedded-block-header': {
    padding: '6px 12px',
    backgroundColor: 'var(--md-embedded-header-bg, #e2e8f0)',
    fontSize: '0.85em',
    fontWeight: '500',
    color: 'var(--md-embedded-header-color, #4a5568)',
    borderBottom: '1px solid var(--md-embedded-border, #e2e8f0)'
  },
  '.cm-embedded-block-content': {
    padding: '12px',
    fontSize: '0.9em',
    lineHeight: '1.5',
    color: 'var(--md-embedded-content-color, #2d3748)',
    whiteSpace: 'pre-wrap'
  }
})

// Additional utility functions for markdown processing
export const markdownUtils = {
  // Extract all wikilinks from text
  extractWikiLinks(text) {
    const links = []
    const regex = /\[\[([^\]|]+)(\|([^\]]+))?\]\]/g
    let match
    
    while ((match = regex.exec(text)) !== null) {
      links.push({
        noteTitle: match[1],
        displayText: match[3] || match[1],
        startPos: match.index,
        endPos: match.index + match[0].length
      })
    }
    
    return links
  },
  
  // Extract all tags from text
  extractTags(text) {
    const tags = []
    const regex = /(?:^|(?<=\s))#([a-zA-Z0-9_][a-zA-Z0-9_/-]*[a-zA-Z0-9_]|[a-zA-Z0-9_])(?=\s|$|[.,!?;:)])/g
    let match
    
    while ((match = regex.exec(text)) !== null) {
      tags.push({
        tag: match[1],
        startPos: match.index,
        endPos: match.index + match[0].length
      })
    }
    
    return tags
  },
  
  // Extract all block references from text
  extractBlockRefs(text) {
    const blockRefs = []
    const regex = /\^([a-zA-Z0-9_-]+)(?=\s|$)/g
    let match
    
    while ((match = regex.exec(text)) !== null) {
      blockRefs.push({
        blockId: match[1],
        startPos: match.index,
        endPos: match.index + match[0].length
      })
    }
    
    return blockRefs
  },
  
  // Generate a unique block ID
  generateBlockId() {
    return Math.random().toString(36).substr(2, 9)
  }
}