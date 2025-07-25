use std::fs::{OpenOptions, create_dir_all};
use std::io::Write;
use std::path::PathBuf;
use chrono::Local;
use std::sync::Mutex;

lazy_static::lazy_static! {
    static ref DEBUG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);
}

pub fn init_debug_log(vault_path: &str) -> Result<(), String> {
    let log_dir = PathBuf::from(vault_path).join(".gaimplan").join("logs");
    
    // Try to create directory, but continue even if it fails
    if let Err(e) = create_dir_all(&log_dir) {
        eprintln!("Warning: Failed to create log directory {}: {}", log_dir.display(), e);
        // Fall back to temp directory
        let temp_dir = std::env::temp_dir();
        let timestamp = Local::now().format("%Y%m%d_%H%M%S");
        let log_file = temp_dir.join(format!("gaimplan_graph_sync_{}.log", timestamp));
        
        let mut debug_file = DEBUG_FILE.lock().unwrap();
        *debug_file = Some(log_file.clone());
        
        println!("📄 Debug log will be saved to: {}", log_file.display());
        return Ok(());
    }
    
    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let log_file = log_dir.join(format!("graph_sync_{}.log", timestamp));
    
    let mut debug_file = DEBUG_FILE.lock().unwrap();
    *debug_file = Some(log_file.clone());
    
    // Write header
    debug_log(&format!("=== Graph Sync Debug Log ==="));
    debug_log(&format!("Started at: {}", Local::now().format("%Y-%m-%d %H:%M:%S")));
    debug_log(&format!("Log file: {}", log_file.display()));
    debug_log(&format!("===========================\n"));
    
    println!("📄 Debug log will be saved to: {}", log_file.display());
    
    Ok(())
}

pub fn debug_log(message: &str) {
    if let Ok(debug_file) = DEBUG_FILE.lock() {
        if let Some(ref path) = *debug_file {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
            {
                let timestamp = Local::now().format("%H:%M:%S%.3f");
                let _ = writeln!(file, "[{}] {}", timestamp, message);
            }
        }
    }
    
    // Also print to console but only important messages
    if message.contains("✅") || message.contains("❌") || message.contains("SUMMARY") {
        println!("{}", message);
    }
}

pub fn close_debug_log() {
    debug_log("\n=== Graph Sync Completed ===");
    debug_log(&format!("Ended at: {}", Local::now().format("%Y-%m-%d %H:%M:%S")));
    
    if let Ok(mut debug_file) = DEBUG_FILE.lock() {
        if let Some(ref path) = *debug_file {
            println!("📄 Debug log saved to: {}", path.display());
        }
        *debug_file = None;
    }
}