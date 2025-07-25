import { EditorView } from '@codemirror/view'

// Configuration for highlights summarizer
const DEFAULT_CONFIG = {
  highlightsTitle: '## Highlights',
  highlightFormat: 'bullet', // 'bullet' or 'blockquote'
  removeOriginals: false,
  runOnSave: false
}

// Extract all highlights from the document content
function extractHighlights(content) {
  console.log('🔍 Extracting highlights from content...')
  const highlightRegex = /==(.*?)==/gs
  const matches = [...content.matchAll(highlightRegex)]
  
  // Extract and clean highlights
  const highlights = matches
    .map(match => match[1].trim())
    .filter(highlight => highlight.length > 0)
  
  console.log(`📝 Found ${highlights.length} highlights`)
  return highlights
}

// Format highlights based on the specified format
function formatHighlights(highlights, format = 'bullet') {
  console.log(`📋 Formatting ${highlights.length} highlights as ${format}`)
  
  if (format === 'bullet') {
    return highlights.map(h => `- ${h}`).join('\n')
  } else if (format === 'blockquote') {
    return highlights.map(h => `> ${h}`).join('\n\n')
  }
  
  return highlights.join('\n')
}

// Create or update the highlights section
function createHighlightsSection(content, highlights, config = DEFAULT_CONFIG) {
  const formattedHighlights = formatHighlights(highlights, config.highlightFormat)
  const newSection = `${config.highlightsTitle}\n${formattedHighlights}\n\n`
  
  // Check if highlights section already exists
  const sectionTitle = config.highlightsTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const sectionRegex = new RegExp(`^${sectionTitle}\\s*.*?(?=\\n## |$)`, 'ms')
  
  let newContent = content
  
  // Remove original highlights if configured
  if (config.removeOriginals) {
    console.log('🗑️ Removing original highlight markers')
    newContent = newContent.replace(/==(.*?)==/gs, '$1')
  }
  
  // Update or insert highlights section
  if (sectionRegex.test(newContent)) {
    console.log('✏️ Updating existing highlights section')
    newContent = newContent.replace(sectionRegex, newSection.trim())
  } else {
    console.log('➕ Adding new highlights section at the beginning')
    newContent = newSection + newContent
  }
  
  return newContent
}

// Main command function for summarizing highlights
export function summarizeHighlights(view, config = DEFAULT_CONFIG) {
  console.log('🚀 Starting highlights summarization...')
  
  try {
    // Get current document content
    const content = view.state.doc.toString()
    
    // Extract highlights
    const highlights = extractHighlights(content)
    
    // Check if any highlights were found
    if (highlights.length === 0) {
      console.log('⚠️ No highlights found in the document')
      // Return false to indicate no highlights found
      return { success: false, message: 'No highlights found in this note.' }
    }
    
    // Create updated content with highlights section
    const newContent = createHighlightsSection(content, highlights, config)
    
    // Update the editor content using a transaction
    const transaction = view.state.update({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: newContent
      }
    })
    
    view.dispatch(transaction)
    
    console.log('✅ Highlights summarization completed successfully')
    return { success: true, message: 'Highlights updated!', count: highlights.length }
    
  } catch (error) {
    console.error('❌ Error during highlights summarization:', error)
    return { success: false, message: 'Error summarizing highlights', error }
  }
}

// Command definition for CodeMirror
export const summarizeHighlightsCommand = (view) => {
  const result = summarizeHighlights(view)
  
  // Show notification based on result
  if (window.showNotification) {
    window.showNotification(result.message, result.success ? 'success' : 'info')
  }
  
  return true // Command was handled
}