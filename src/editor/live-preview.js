import { syntaxTree } from '@codemirror/language'
import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'

// Enhanced heading widget that renders beautiful headings
class HeadingWidget extends WidgetType {
  constructor(level, text, markupLength) {
    super()
    this.level = level
    this.text = text
    this.markupLength = markupLength
  }

  toDOM() {
    const heading = document.createElement(`h${this.level}`)
    heading.className = `cm-heading cm-heading-${this.level}`
    heading.textContent = this.text
    
    // Add heading anchor functionality
    heading.onclick = (e) => {
      e.stopPropagation()
      // Could implement heading navigation here
    }
    
    return heading
  }

  eq(other) {
    return other.level === this.level && other.text === this.text
  }

  get estimatedHeight() {
    const heights = { 1: 48, 2: 40, 3: 32, 4: 28, 5: 24, 6: 22 }
    return heights[this.level] || 24
  }
}

// Enhanced list item widget with proper spacing and checkboxes
class ListItemWidget extends WidgetType {
  constructor(content, isTask = false, isChecked = false, indent = 0) {
    super()
    this.content = content
    this.isTask = isTask
    this.isChecked = isChecked
    this.indent = indent
  }

  toDOM() {
    const li = document.createElement('div')
    li.className = 'cm-list-item'
    li.style.paddingLeft = `${this.indent * 20 + 20}px`
    
    if (this.isTask) {
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = this.isChecked
      checkbox.className = 'cm-task-checkbox'
      checkbox.onclick = (e) => {
        e.stopPropagation()
        // Toggle task state - this would update the markdown
      }
      
      const label = document.createElement('label')
      label.className = 'cm-task-label'
      if (this.isChecked) {
        label.classList.add('cm-task-checked')
      }
      label.appendChild(checkbox)
      
      const text = document.createElement('span')
      text.textContent = this.content
      label.appendChild(text)
      
      li.appendChild(label)
    } else {
      const bullet = document.createElement('span')
      bullet.className = 'cm-list-bullet'
      bullet.textContent = '•'
      
      const text = document.createElement('span')
      text.className = 'cm-list-text'
      text.textContent = this.content
      
      li.appendChild(bullet)
      li.appendChild(text)
    }
    
    return li
  }

  eq(other) {
    return other.content === this.content && 
           other.isTask === this.isTask && 
           other.isChecked === this.isChecked &&
           other.indent === this.indent
  }
}

// Enhanced blockquote widget
class BlockquoteWidget extends WidgetType {
  constructor(content) {
    super()
    this.content = content
  }

  toDOM() {
    const blockquote = document.createElement('blockquote')
    blockquote.className = 'cm-blockquote'
    blockquote.textContent = this.content
    return blockquote
  }

  eq(other) {
    return other.content === this.content
  }
}

// Code block widget with syntax highlighting
class CodeBlockWidget extends WidgetType {
  constructor(content, language = '') {
    super()
    this.content = content
    this.language = language
  }

  toDOM() {
    const pre = document.createElement('pre')
    pre.className = 'cm-code-block'
    
    const code = document.createElement('code')
    if (this.language) {
      code.className = `language-${this.language}`
    }
    code.textContent = this.content
    
    pre.appendChild(code)
    return pre
  }

  eq(other) {
    return other.content === this.content && other.language === this.language
  }
}

// Simple task checkbox widget
class TaskCheckboxWidget extends WidgetType {
  constructor(isChecked) {
    super()
    this.isChecked = isChecked
  }

  toDOM() {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = this.isChecked
    checkbox.className = 'cm-task-checkbox-inline'
    checkbox.onclick = (e) => {
      e.stopPropagation()
      // Toggle task state - this would update the markdown
    }
    return checkbox
  }

  eq(other) {
    return other.isChecked === this.isChecked
  }
}

// Simple bullet widget
class BulletWidget extends WidgetType {
  toDOM() {
    const bullet = document.createElement('span')
    bullet.className = 'cm-bullet-inline'
    bullet.textContent = '•'
    return bullet
  }

  eq(other) {
    return true
  }
}

// Horizontal rule widget (keeping this as widget replacement)
class HorizontalRuleWidget extends WidgetType {
  toDOM() {
    const hr = document.createElement('hr')
    hr.className = 'cm-horizontal-rule'
    return hr
  }

  eq(other) {
    return true
  }
}

// Live preview plugin that renders markdown beautifully using inline styling
export const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.computeDecorations(view)
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = this.computeDecorations(update.view)
      }
    }

    computeDecorations(view) {
      const builder = new RangeSetBuilder()
      const doc = view.state.doc
      
      for (const { from, to } of view.visibleRanges) {
        this.processRange(view, builder, from, to)
      }
      
      return builder.finish()
    }

    processRange(view, builder, from, to) {
      const doc = view.state.doc
      
      // Process line by line for markdown styling
      for (let pos = from; pos <= to;) {
        const line = doc.lineAt(pos)
        const text = line.text
        
        // Skip empty lines
        if (text.trim() === '') {
          pos = line.to + 1
          continue
        }
        
        // Process different markdown elements
        this.processLine(view, builder, line, text)
        
        pos = line.to + 1
      }
    }

    processLine(view, builder, line, text) {
      const trimmed = text.trim()
      const cursor = view.state.selection.main.head
      const isLineActive = cursor >= line.from && cursor <= line.to
      
      // If line is active (being edited), show raw markdown
      if (isLineActive) {
        return
      }
      
      // Note: Inline formatting (bold, italic, underline) AND headings are now 
      // handled by the separate formatting-extension.js to ensure proper 
      // active line detection and consistent behavior
      
      // Horizontal rules (--- or ***)
      if (trimmed.match(/^(-{3,}|\*{3,}|_{3,})$/)) {
        builder.add(
          line.from,
          line.to,
          Decoration.replace({
            widget: new HorizontalRuleWidget()
          })
        )
        return
      }
      
      // Task lists (- [ ] or - [x])
      const taskMatch = trimmed.match(/^(-\s\[(x| )\])\s+(.*)$/)
      if (taskMatch) {
          const checkbox = taskMatch[1]
          const isChecked = taskMatch[2] === 'x'
          const content = taskMatch[3]
          const checkboxStart = line.from + text.indexOf(checkbox)
          const contentStart = line.from + text.indexOf(content)
          
          // Replace checkbox with styled checkbox
          builder.add(
              checkboxStart,
              contentStart,
              Decoration.replace({
                  widget: new TaskCheckboxWidget(isChecked)
              })
          )
          return
      }
      
      // Regular list items (- or *)
      const listMatch = trimmed.match(/^([*-])\s+(.*)$/)
      if (listMatch) {
          const bullet = listMatch[1]
          const content = listMatch[2]
          const bulletStart = line.from + text.indexOf(bullet)
          const contentStart = line.from + text.indexOf(content)
          
          // Replace bullet with styled bullet
          builder.add(
              bulletStart,
              contentStart,
              Decoration.replace({
                  widget: new BulletWidget()
              })
          )
          return
      }
    }
    
    // Note: Inline formatting (bold, italic, underline) is now handled 
    // by the separate formatting-extension.js to avoid conflicts and 
    // ensure proper active line detection.
  },
  {
    decorations: (v) => v.decorations
  }
)

// Enhanced styling for the live preview - widgets only
export const livePreviewStyles = EditorView.theme({
  // Simple inline elements
  '.cm-task-checkbox-inline': {
    marginRight: '0.5em',
    accentColor: 'var(--accent-color, #5b47e0)'
  },
  
  '.cm-bullet-inline': {
    color: 'var(--md-list-bullet, #586e75)',
    marginRight: '0.5em'
  },
  
  // Horizontal rules (still using widgets)
  '.cm-horizontal-rule': {
    border: 'none',
    borderTop: '2px solid var(--md-hr-color, #e1e4e8)',
    margin: '1em 0',
    width: '100%'
  }
  
  // Note: Inline formatting styles (bold, italic, underline) AND headings 
  // are now handled by formatting-extension.js
})

// Helper function to enable/disable live preview
export function toggleLivePreview(view, enabled) {
  const effects = []
  
  if (enabled) {
    effects.push({
      effects: view.state.compartment.reconfigure([
        livePreviewPlugin,
        livePreviewStyles
      ])
    })
  } else {
    effects.push({
      effects: view.state.compartment.reconfigure([])
    })
  }
  
  view.dispatch({ effects })
}