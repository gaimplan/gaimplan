import { Decoration, ViewPlugin, WidgetType } from '@codemirror/view'
import { invoke } from '@tauri-apps/api/core'

// Widget for rendering images
class ImageWidget extends WidgetType {
  constructor(url) {
    super()
    this.url = url
  }

  eq(other) {
    return other.url === this.url
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.style.display = 'block'
    wrapper.style.margin = '8px 0'
    
    const img = document.createElement('img')
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.borderRadius = '4px'
    img.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
    
    // Show loading state
    wrapper.innerHTML = `
      <div style="
        padding: 24px;
        background: var(--bg-secondary, #fbfbfa);
        border: 1px solid var(--border-color, #e9e9e7);
        border-radius: 4px;
        text-align: center;
        color: var(--text-secondary, #6b6b6b);
        font-size: 13px;
        font-family: 'Inter', sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Loading image...</div>
      </div>
    `
    
    // Use Tauri to fetch the image, bypassing CORS
    invoke('fetch_image_as_base64', { url: this.url })
      .then(base64Data => {
        img.src = base64Data
        wrapper.innerHTML = ''
        wrapper.appendChild(img)
      })
      .catch(error => {
        console.error('Failed to fetch image:', error)
        wrapper.innerHTML = `
          <div style="
            padding: 16px;
            background: var(--bg-tertiary, #f1f1ef);
            border: 1px solid var(--border-color, #e9e9e7);
            border-radius: 4px;
            text-align: center;
            color: var(--text-secondary, #6b6b6b);
            font-size: 13px;
            font-family: 'Inter', sans-serif;
          ">
            <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
            <div style="margin-bottom: 4px;">Failed to load image</div>
            <div style="font-size: 11px; opacity: 0.8;">
              ${this.url.length > 50 ? this.url.substring(0, 50) + '...' : this.url}
            </div>
            <div style="font-size: 11px; opacity: 0.6; margin-top: 8px;">
              ${error.toString()}
            </div>
          </div>
        `
      })
    
    return wrapper
  }
}

// Widget for rendering local images from the files folder
class LocalImageWidget extends WidgetType {
  constructor(filename) {
    super()
    this.filename = filename
  }

  eq(other) {
    return other.filename === this.filename
  }

  toDOM() {
    const wrapper = document.createElement('div')
    wrapper.style.display = 'block'
    wrapper.style.margin = '8px 0'
    
    const img = document.createElement('img')
    img.style.maxWidth = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'
    img.style.borderRadius = '4px'
    img.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
    
    // Show loading state
    wrapper.innerHTML = `
      <div style="
        padding: 24px;
        background: var(--bg-secondary, #fbfbfa);
        border: 1px solid var(--border-color, #e9e9e7);
        border-radius: 4px;
        text-align: center;
        color: var(--text-secondary, #6b6b6b);
        font-size: 13px;
        font-family: 'Inter', sans-serif;
      ">
        <div style="font-size: 24px; margin-bottom: 8px;">⏳</div>
        <div>Loading image...</div>
      </div>
    `
    
    // Read local image file using the new command
    invoke('read_image_as_base64', { filePath: `files/${this.filename}` })
      .then(base64Data => {
        img.src = base64Data
        wrapper.innerHTML = ''
        wrapper.appendChild(img)
      })
      .catch(error => {
        console.error('Failed to load local image:', error)
        wrapper.innerHTML = `
          <div style="
            padding: 16px;
            background: var(--bg-tertiary, #f1f1ef);
            border: 1px solid var(--border-color, #e9e9e7);
            border-radius: 4px;
            text-align: center;
            color: var(--text-secondary, #6b6b6b);
            font-size: 13px;
            font-family: 'Inter', sans-serif;
          ">
            <div style="font-size: 24px; margin-bottom: 8px;">🖼️</div>
            <div style="margin-bottom: 4px;">Failed to load image</div>
            <div style="font-size: 11px; opacity: 0.8;">
              ${this.filename}
            </div>
            <div style="font-size: 11px; opacity: 0.6; margin-top: 8px;">
              ${error.toString()}
            </div>
          </div>
        `
      })
    
    return wrapper
  }
}

// Create decorations for image embeds
function createImageDecorations(view) {
  const decorations = []
  const doc = view.state.doc
  const text = doc.toString()
  
  // Regex for markdown image syntax: ![](URL) or ![alt text](URL)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  
  // Regex syntax: ![[filename.png]]
  const syntaxImageRegex = /!\[\[([^\]]+\.(png|jpg|jpeg|gif))\]\]/gi
  
  let match
  // Handle standard markdown images
  while ((match = imageRegex.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    const altText = match[1]
    const url = match[2]
    
    // Get the current line
    const line = doc.lineAt(from)
    const cursor = view.state.selection.main.head
    const isLineActive = cursor >= line.from && cursor <= line.to
    
    if (!isLineActive) {
      // Replace the markdown syntax with the image widget
      decorations.push(
        Decoration.replace({
          widget: new ImageWidget(url),
          inclusive: false
        }).range(from, to)
      )
    }
  }
  
  // Handle syntax-style images
  while ((match = syntaxImageRegex.exec(text)) !== null) {
    const from = match.index
    const to = from + match[0].length
    const filename = match[1]
    
    // Get the current line
    const line = doc.lineAt(from)
    const cursor = view.state.selection.main.head
    const isLineActive = cursor >= line.from && cursor <= line.to
    
    if (!isLineActive) {
      // For syntax, we need a special widget that loads local files
      decorations.push(
        Decoration.replace({
          widget: new LocalImageWidget(filename),
          inclusive: false
        }).range(from, to)
      )
    }
  }
  
  return Decoration.set(decorations, true)
}

// View plugin to manage image decorations
export const imageEmbedPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = createImageDecorations(view)
    }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = createImageDecorations(update.view)
      }
    }
  },
  {
    decorations: v => v.decorations
  }
)