// Centralized Tauri invoke wrapper with proper error handling and fallbacks

let invokeFunction = null;
let initPromise = null;

function isTauriEnvironment() {
    // Check if we're in a Tauri window
    return window.__TAURI_INTERNALS__ !== undefined || 
           window.__TAURI__ !== undefined ||
           window.__TAURI_IPC__ !== undefined;
}

async function initializeInvoke() {
    if (invokeFunction) return invokeFunction;
    
    console.log('[TauriInvoke] Initializing invoke function...');
    
    // First check if we're in a Tauri environment
    if (!isTauriEnvironment()) {
        console.error('[TauriInvoke] ❌ NOT RUNNING IN TAURI WINDOW!');
        console.error('[TauriInvoke] You are viewing this in a regular browser.');
        console.error('[TauriInvoke] Run the app with: npm run tauri:dev');
        console.error('[TauriInvoke] NOT with: npm run dev');
        throw new Error('Not running in Tauri window. Use "npm run tauri:dev" instead of "npm run dev"');
    }
    
    try {
        // Try dynamic import first
        const tauriCore = await import('@tauri-apps/api/core');
        if (tauriCore && tauriCore.invoke) {
            console.log('[TauriInvoke] Successfully imported invoke from @tauri-apps/api/core');
            invokeFunction = tauriCore.invoke;
            return invokeFunction;
        }
    } catch (error) {
        console.error('[TauriInvoke] Failed to import from @tauri-apps/api/core:', error);
    }
    
    // Try window.__TAURI__ fallback
    if (window.__TAURI__?.core?.invoke) {
        console.log('[TauriInvoke] Using window.__TAURI__.core.invoke fallback');
        invokeFunction = window.__TAURI__.core.invoke;
        return invokeFunction;
    }
    
    // Wait a bit and try again (in case Tauri is still initializing)
    console.log('[TauriInvoke] Tauri not ready, waiting 100ms...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (window.__TAURI__?.core?.invoke) {
        console.log('[TauriInvoke] Found window.__TAURI__.core.invoke after delay');
        invokeFunction = window.__TAURI__.core.invoke;
        return invokeFunction;
    }
    
    throw new Error('Tauri invoke function not available');
}

export async function getInvoke() {
    // Ensure we only initialize once
    if (!initPromise) {
        initPromise = initializeInvoke();
    }
    return initPromise;
}

export async function invokeWrapper(command, args) {
    console.log(`[TauriInvoke] Calling ${command} with args:`, args);
    
    try {
        const invoke = await getInvoke();
        const result = await invoke(command, args);
        console.log(`[TauriInvoke] ${command} completed successfully`);
        return result;
    } catch (error) {
        console.error(`[TauriInvoke] ${command} failed:`, error);
        throw error;
    }
}

// Export a default object that mimics the invoke function
export default {
    invoke: invokeWrapper
};