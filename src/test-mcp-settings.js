import { invoke } from '@tauri-apps/api/core';

// Test function to verify MCP settings are loading correctly
export async function testMCPSettings() {
  try {
    console.log('Testing MCP settings load...');
    const settings = await invoke('get_mcp_settings');
    console.log('MCP Settings loaded:', settings);
    
    if (settings && settings.servers) {
      const serverCount = Object.keys(settings.servers).length;
      console.log(`Found ${serverCount} MCP servers configured`);
      
      // List all servers
      for (const [id, config] of Object.entries(settings.servers)) {
        console.log(`- ${config.name} (${id}): ${config.enabled ? 'ENABLED' : 'DISABLED'}`);
      }
    }
    
    return settings;
  } catch (error) {
    console.error('Failed to load MCP settings:', error);
    throw error;
  }
}

// Add to window for easy access
window.testMCPSettings = testMCPSettings;