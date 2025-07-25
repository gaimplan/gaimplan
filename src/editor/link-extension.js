import { Decoration, ViewPlugin, EditorView } from '@codemirror/view'
import { open } from '@tauri-apps/plugin-shell'

// Create decorations for markdown links
function createLinkDecorations(view) {
  const decorations = []
  const doc = view.state.doc
  const text = doc.toString()
  
  // Regex for markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  
  let match
  while ((match = linkRegex.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    const linkText = match[1]
    const url = match[2]
    
    // Get the current line
    const line = doc.lineAt(from)
    const cursor = view.state.selection.main.head
    const isLineActive = cursor >= line.from && cursor <= line.to
    
    if (!isLineActive) {
      // Hide the brackets and URL, show only the link text
      const textStart = from + 1 // After '['
      const textEnd = from + 1 + linkText.length // Before ']'
      
      // Hide opening bracket
      decorations.push(
        Decoration.replace({
          inclusive: false
        }).range(from, from + 1)
      )
      
      // Style the link text
      decorations.push(
        Decoration.mark({
          class: 'cm-link-text',
          attributes: {
            'data-url': url,
            title: `${url}\n⌘+Click to open` // Show URL and instruction on hover
          }
        }).range(textStart, textEnd)
      )
      
      // Hide closing bracket and URL
      decorations.push(
        Decoration.replace({
          inclusive: false
        }).range(textEnd, to)
      )
    }
  }
  
  return Decoration.set(decorations, true)
}

// View plugin to manage link decorations
export const linkPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = createLinkDecorations(view)
      this.setupClickHandler(view)
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = createLinkDecorations(update.view)
        // Re-setup click handlers after decoration update
        setTimeout(() => this.setupClickHandler(update.view), 50)
      }
    }
    
    setupClickHandler(view) {
      // Remove existing handler to avoid duplicates
      if (this.clickHandler) {
        view.dom.removeEventListener('mousedown', this.clickHandler, true)
      }
      
      // Add mousedown handler to capture Cmd key state early
      this.clickHandler = async (e) => {
        console.log('Mousedown event captured, metaKey:', e.metaKey, 'button:', e.button)
        
        // Only handle left click (button 0) with Cmd/Ctrl
        if ((e.metaKey || e.ctrlKey) && e.button === 0) {
          const linkElements = view.dom.querySelectorAll('.cm-link-text')
          console.log('Found link elements:', linkElements.length)
          
          for (const linkEl of linkElements) {
            if (linkEl.contains(e.target) || linkEl === e.target) {
              const url = linkEl.getAttribute('data-url')
              console.log('Clicked on link with URL:', url)
              
              if (url) {
                e.preventDefault()
                e.stopPropagation()
                
                // Small delay to ensure event doesn't interfere with editor
                setTimeout(async () => {
                  try {
                    // Ensure URL has proper protocol
                    let normalizedUrl = url
                    if (!url.match(/^https?:\/\//)) {
                      normalizedUrl = 'https://' + url
                      console.log('Added protocol to URL:', normalizedUrl)
                    }
                    
                    await open(normalizedUrl)
                    console.log('URL opened successfully')
                  } catch (error) {
                    console.error('Failed to open URL:', error)
                    // Fallback to window.open (though this won't work in Tauri)
                    window.open(normalizedUrl || url, '_blank')
                  }
                }, 10)
                
                return false
              }
            }
          }
        }
      }
      
      view.dom.addEventListener('mousedown', this.clickHandler, true)
    }
    
    destroy() {
      if (this.clickHandler && this.view) {
        this.view.dom.removeEventListener('mousedown', this.clickHandler, true)
      }
    }
  },
  {
    decorations: v => v.decorations
  }
)

// Styles for links
export const linkStyles = EditorView.theme({
  '.cm-link-text': {
    color: '#2e6da4',
    textDecoration: 'none',
    cursor: 'pointer',
    borderBottom: '1px solid transparent',
    transition: 'all 0.2s',
    position: 'relative',
    zIndex: 1
  },
  
  '.cm-link-text:hover': {
    color: '#1a4d7a',
    borderBottomColor: '#2e6da4'
  }
})