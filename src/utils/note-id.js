import { invoke } from '@tauri-apps/api/core'

// Calculate the note ID for a given file path
// This must match the backend's ID generation logic
export async function calculateNoteId(filePath, vaultPath, vaultId) {
  try {
    const noteId = await invoke('calculate_note_id', {
      filePath,
      vaultPath,
      vaultId
    })
    return noteId
  } catch (error) {
    console.error('Failed to calculate note ID:', error)
    throw error
  }
}

// Get the current vault ID
export async function getVaultId() {
  try {
    const vaultId = await invoke('get_vault_id')
    return vaultId
  } catch (error) {
    console.error('Failed to get vault ID:', error)
    throw error
  }
}