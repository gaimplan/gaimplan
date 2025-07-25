import { keymap } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'

// Debug logging helper
function log(message, ...args) {
  console.log(`[BulletList] ${message}`, ...args)
}

// Regular expressions for detecting list items
const BULLET_REGEX = /^(\s*)([-*+])\s+(.*)$/
const NUMBERED_REGEX = /^(\s*)(\d+)\.\s+(.*)$/
const TASK_REGEX = /^(\s*)([-*+])\s+\[([ x])\]\s+(.*)$/
const EMPTY_BULLET_REGEX = /^(\s*)([-*+])\s*$/
const EMPTY_NUMBERED_REGEX = /^(\s*)(\d+)\.\s*$/
const EMPTY_TASK_REGEX = /^(\s*)([-*+])\s+\[([ x])\]\s*$/

// Check if a line is a bullet list item
function isBulletListItem(line) {
  return BULLET_REGEX.test(line) || NUMBERED_REGEX.test(line) || TASK_REGEX.test(line)
}

// Check if a line is an empty bullet list item
function isEmptyBulletListItem(line) {
  return EMPTY_BULLET_REGEX.test(line) || EMPTY_NUMBERED_REGEX.test(line) || EMPTY_TASK_REGEX.test(line)
}

// Extract bullet info from a line
function getBulletInfo(line) {
  // Check for task first since it's more specific
  let match = TASK_REGEX.exec(line)
  if (match) {
    return {
      indent: match[1],
      bullet: match[2],
      content: match[4],
      type: 'task',
      checked: match[3] === 'x'
    }
  }
  
  match = BULLET_REGEX.exec(line)
  if (match) {
    return {
      indent: match[1],
      bullet: match[2],
      content: match[3],
      type: 'bullet'
    }
  }
  
  match = NUMBERED_REGEX.exec(line)
  if (match) {
    return {
      indent: match[1],
      bullet: match[2] + '.',
      content: match[3],
      type: 'numbered',
      number: parseInt(match[2])
    }
  }
  
  return null
}

// Get the next bullet for numbered lists
function getNextBullet(bulletInfo) {
  if (bulletInfo.type === 'numbered') {
    return `${bulletInfo.number + 1}.`
  }
  return bulletInfo.bullet
}

// Custom Enter key handler for bullet lists
function handleBulletListEnter(view) {
  const state = view.state
  const selection = state.selection.main
  
  // Only handle when cursor is at the end of a line
  if (selection.from !== selection.to) {
    log('Selection is not empty, skipping bullet list handling')
    return false
  }
  
  const line = state.doc.lineAt(selection.from)
  const lineText = line.text
  const cursorPos = selection.from - line.from
  
  log('Enter pressed on line:', lineText)
  log('Cursor position in line:', cursorPos)
  
  // Check if we're at the end of the line
  if (cursorPos !== lineText.length) {
    log('Cursor not at end of line, skipping bullet list handling')
    return false
  }
  
  // Check if current line is an empty bullet list item
  if (isEmptyBulletListItem(lineText)) {
    log('Empty bullet list item detected, removing bullet and exiting list mode')
    
    // Remove the bullet and create a new line
    view.dispatch({
      changes: {
        from: line.from,
        to: line.to,
        insert: ''
      },
      selection: EditorSelection.cursor(line.from)
    })
    
    return true
  }
  
  // Check if current line is a bullet list item
  const bulletInfo = getBulletInfo(lineText)
  if (!bulletInfo) {
    log('Not a bullet list item, skipping')
    return false
  }
  
  log('Bullet info:', bulletInfo)
  
  // Create the next bullet line
  let newLine
  if (bulletInfo.type === 'task') {
    // For tasks, create a new unchecked task
    newLine = `\n${bulletInfo.indent}${bulletInfo.bullet} [ ] `
  } else {
    const nextBullet = getNextBullet(bulletInfo)
    newLine = `\n${bulletInfo.indent}${nextBullet} `
  }
  
  log('Inserting new bullet line:', newLine)
  
  // Insert the new bullet line
  view.dispatch({
    changes: {
      from: selection.from,
      insert: newLine
    },
    selection: EditorSelection.cursor(selection.from + newLine.length)
  })
  
  return true
}

// Export the bullet list extension
export function bulletListExtension() {
  log('Initializing bullet list extension')
  return keymap.of([
    {
      key: 'Enter',
      run: handleBulletListEnter,
      preventDefault: true
    }
  ])
}

// Export styles for bullet lists (if needed for future enhancements)
export const bulletListStyles = `
  /* Future styles for enhanced bullet list display */
`