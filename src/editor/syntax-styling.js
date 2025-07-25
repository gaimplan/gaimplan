import { ViewPlugin } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// Simple styling plugin that adds CSS classes without replacing content
export const syntaxStylingPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.addStylingClasses(view)
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        // Small delay to ensure DOM is ready
        setTimeout(() => this.addStylingClasses(update.view), 10)
      }
    }

    addStylingClasses(view) {
      try {
        const content = view.contentDOM
        if (!content) return

        // Find and style headings
        const lines = content.querySelectorAll('.cm-line')
        lines.forEach(line => {
          const text = line.textContent.trim()
          
          // Style headings by adding classes to the line
          if (text.startsWith('# ')) {
            line.classList.add('cm-heading-1')
            line.setAttribute('data-heading', '1')
          } else if (text.startsWith('## ')) {
            line.classList.add('cm-heading-2')
            line.setAttribute('data-heading', '2')
          } else if (text.startsWith('### ')) {
            line.classList.add('cm-heading-3')
            line.setAttribute('data-heading', '3')
          } else if (text.startsWith('#### ')) {
            line.classList.add('cm-heading-4')
            line.setAttribute('data-heading', '4')
          } else if (text.startsWith('##### ')) {
            line.classList.add('cm-heading-5')
            line.setAttribute('data-heading', '5')
          } else if (text.startsWith('###### ')) {
            line.classList.add('cm-heading-6')
            line.setAttribute('data-heading', '6')
          }

          // Style task lists
          if (text.match(/^- \[ \]/)) {
            line.classList.add('cm-task-unchecked')
          } else if (text.match(/^- \[x\]/)) {
            line.classList.add('cm-task-checked')
          } else if (text.startsWith('- ')) {
            line.classList.add('cm-list-item')
          }
        })
      } catch (error) {
        // Silently fail to avoid breaking the editor
        console.log('Styling error:', error)
      }
    }
  }
)