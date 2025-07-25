use std::path::Path;
use std::sync::Arc;
use tokio::sync::mpsc;
use notify::{Event, EventKind, RecursiveMode, Watcher};
use chrono::Utc;
use sha2::{Sha256, Digest};
use crate::vault::Vault;
use super::{GraphManagerTrait, Note};

pub struct GraphSyncService {
    graph_manager: Arc<dyn GraphManagerTrait>,
    vault: Arc<Vault>,
    watcher_handle: Option<tokio::task::JoinHandle<()>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl GraphSyncService {
    pub fn new(graph_manager: Arc<dyn GraphManagerTrait>, vault: Arc<Vault>) -> Self {
        Self {
            graph_manager,
            vault,
            watcher_handle: None,
            shutdown_tx: None,
        }
    }
    
    pub async fn start(&mut self) -> Result<(), String> {
        if self.watcher_handle.is_some() {
            return Ok(()); // Already running
        }
        
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);
        let graph_manager = self.graph_manager.clone();
        let vault = self.vault.clone();
        let vault_path = vault.path().to_path_buf();
        let vault_id = self.generate_vault_id(&vault_path);
        
        let handle = tokio::spawn(async move {
            let (tx, mut rx) = mpsc::channel(100);
            
            // Create file watcher
            let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    let _ = tx.blocking_send(event);
                }
            }).expect("Failed to create file watcher");
            
            // Watch the vault directory
            watcher
                .watch(&vault_path, RecursiveMode::Recursive)
                .expect("Failed to watch vault directory");
            
            // Process events
            loop {
                tokio::select! {
                    Some(event) = rx.recv() => {
                        if let Err(e) = Self::handle_file_event(
                            event,
                            &graph_manager,
                            &vault,
                            &vault_id
                        ).await {
                            eprintln!("Error handling file event: {}", e);
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        break;
                    }
                }
            }
        });
        
        self.watcher_handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
        
        // Initial sync of existing files
        self.initial_sync().await?;
        
        Ok(())
    }
    
    pub async fn stop(&mut self) -> Result<(), String> {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(()).await;
        }
        
        if let Some(handle) = self.watcher_handle.take() {
            handle.await.map_err(|e| format!("Failed to stop sync service: {}", e))?;
        }
        
        Ok(())
    }
    
    pub async fn initial_sync(&self) -> Result<(), String> {
        println!("Starting initial sync...");
        
        // Initialize debug logging
        println!("Initializing debug log...");
        super::debug_logger::init_debug_log(&self.vault.path().to_string_lossy())?;
        
        println!("Generating vault ID...");
        let vault_id = self.generate_vault_id(self.vault.path());
        println!("Vault ID: {}", vault_id);
        
        println!("Listing markdown files...");
        
        // Simple file listing without following symlinks
        let mut files = Vec::new();
        let vault_path = self.vault.path();
        println!("Scanning vault path: {}", vault_path.display());
        
        use walkdir::WalkDir;
        for entry in WalkDir::new(vault_path)
            .follow_links(false)  // Don't follow symlinks to avoid loops
            .max_depth(10)        // Limit depth
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                files.push(path.to_path_buf());
            }
        }
        
        println!("Found {} markdown files", files.len());
        
        let mut notes = Vec::new();
        
        // First pass: Create all notes
        println!("Creating notes in graph database...");
        for (i, file_path) in files.iter().enumerate() {
            if file_path.extension().and_then(|s| s.to_str()) == Some("md") {
                println!("Processing file {}/{}: {}", i+1, files.len(), file_path.display());
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let note = self.file_to_note(&file_path, &content, &vault_id)?;
                    
                    // Create or update note
                    println!("Creating note: {}", note.title);
                    self.graph_manager.create_note(&note).await
                        .map_err(|e| {
                            println!("Failed to create note: {}", e);
                            format!("Failed to create note '{}': {}", note.title, e)
                        })?;
                    notes.push(note);
                } else {
                    println!("Failed to read file: {}", file_path.display());
                }
            }
        }
        
        super::debug_logger::debug_log(&format!("Created {} notes in graph database", notes.len()));
        
        // Second pass: Extract tags and create relationships between notes with shared tags
        super::debug_logger::debug_log("📌 EXTRACTING TAGS AND CREATING TAG-BASED RELATIONSHIPS");
        super::debug_logger::debug_log("=========================================================");
        
        // Build a map of tags to notes
        let mut tag_to_notes: std::collections::HashMap<String, Vec<&Note>> = std::collections::HashMap::new();
        
        for note in &notes {
            // Extract tags from the note
            let tag_regex = regex::Regex::new(r"#([a-zA-Z0-9_/\-]+)").unwrap();
            let mut note_tags = Vec::new();
            for cap in tag_regex.captures_iter(&note.content) {
                if let Some(tag_text) = cap.get(1) {
                    let tag_name = tag_text.as_str().to_string();
                    note_tags.push(tag_name.clone());
                    tag_to_notes.entry(tag_name).or_insert_with(Vec::new).push(note);
                }
            }
            if !note_tags.is_empty() {
                super::debug_logger::debug_log(&format!("Note '{}' has tags: {:?}", note.title, note_tags));
            }
        }
        
        super::debug_logger::debug_log(&format!("\nFound {} unique tags across all notes", tag_to_notes.len()));
        
        // Create relationships between notes that share tags
        let mut tag_relationships_created = 0;
        for (tag_name, tagged_notes) in &tag_to_notes {
            if tagged_notes.len() > 1 {
                super::debug_logger::debug_log(&format!("\nTag '#{}' is shared by {} notes:", tag_name, tagged_notes.len()));
                for note in tagged_notes {
                    super::debug_logger::debug_log(&format!("  - {}", note.title));
                }
                
                // Create relationships between all pairs of notes with this tag
                for i in 0..tagged_notes.len() {
                    for j in (i+1)..tagged_notes.len() {
                        let note1 = tagged_notes[i];
                        let note2 = tagged_notes[j];
                        
                        let rel = super::Relationship {
                            from_id: note1.id.clone(),
                            to_id: note2.id.clone(),
                            rel_type: "SHARES_TAG".to_string(),
                            properties: serde_json::json!({
                                "tag": tag_name,
                                "method": "tag_extraction"
                            }),
                        };
                        
                        match self.graph_manager.create_relationship(&rel).await {
                            Ok(_) => {
                                super::debug_logger::debug_log(&format!(
                                    "✅ Created SHARES_TAG relationship: '{}' <-> '{}' (tag: #{})", 
                                    note1.title, note2.title, tag_name
                                ));
                                tag_relationships_created += 1;
                            },
                            Err(e) => {
                                super::debug_logger::debug_log(&format!(
                                    "❌ Failed to create tag relationship: {}", e
                                ));
                            }
                        }
                    }
                }
            }
        }
        
        super::debug_logger::debug_log(&format!("\n📌 TAG EXTRACTION SUMMARY"));
        super::debug_logger::debug_log(&format!("========================"));
        super::debug_logger::debug_log(&format!("Total unique tags found: {}", tag_to_notes.len()));
        super::debug_logger::debug_log(&format!("Tag-based relationships created: {}", tag_relationships_created));
        super::debug_logger::debug_log("");
        
        use super::semantic_relationships::SemanticRelationshipBuilder;
        
        if notes.is_empty() {
            super::debug_logger::debug_log("⚠️ No notes found to analyze for relationships");
            super::debug_logger::close_debug_log();
            return Ok(());
        }
        
        super::debug_logger::debug_log(&format!("🔍 Starting semantic relationship analysis for {} notes...", notes.len()));
        let _count = SemanticRelationshipBuilder::analyze_and_relate_notes(notes, &self.graph_manager).await?;
        
        // Close debug log
        super::debug_logger::close_debug_log();
        
        Ok(())
    }
    
    async fn handle_file_event(
        event: Event,
        graph_manager: &Arc<dyn GraphManagerTrait>,
        vault: &Arc<Vault>,
        vault_id: &str,
    ) -> Result<(), String> {
        match event.kind {
            EventKind::Create(_) | EventKind::Modify(_) => {
                for path in event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("md") {
                        Self::sync_file(&path, graph_manager, vault, vault_id).await?;
                    }
                }
            }
            EventKind::Remove(_) => {
                for path in event.paths {
                    if path.extension().and_then(|s| s.to_str()) == Some("md") {
                        let note_id = Self::generate_note_id(&path, vault_id);
                        graph_manager.delete_note(&note_id).await?;
                    }
                }
            }
            _ => {}
        }
        
        Ok(())
    }
    
    async fn sync_file(
        path: &Path,
        graph_manager: &Arc<dyn GraphManagerTrait>,
        vault: &Arc<Vault>,
        vault_id: &str,
    ) -> Result<(), String> {
        if let Ok(content) = std::fs::read_to_string(path) {
            let note = Self::file_to_note_static(path, &content, vault_id, vault.path())?;
            
            // Check if note exists
            if graph_manager.get_note(&note.id).await?.is_some() {
                graph_manager.update_note(&note).await?;
            } else {
                graph_manager.create_note(&note).await?;
            }
            
            // Extract and create relationships
            // Extract tags
            Self::extract_and_sync_tags(&note, &content, graph_manager).await?;
            // Skip wikilinks for now
            // Self::extract_and_sync_links(&note, &content, graph_manager).await?;
        }
        
        Ok(())
    }
    
    async fn extract_and_sync_links(
        note: &Note,
        content: &str,
        graph_manager: &Arc<dyn GraphManagerTrait>,
    ) -> Result<(), String> {
        println!("Checking note '{}' for links...", note.title);
        // Extract [[wiki-links]]
        let link_regex = regex::Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
        
        let mut link_count = 0;
        for cap in link_regex.captures_iter(content) {
            if let Some(link_text) = cap.get(1) {
                let link_name = link_text.as_str();
                
                // Try to find the linked note
                // For now, we'll create a placeholder relationship
                let rel = super::Relationship {
                    from_id: note.id.clone(),
                    to_id: format!("placeholder_{}", link_name), // TODO: Resolve to actual note ID
                    rel_type: "LINKS_TO".to_string(),
                    properties: serde_json::json!({
                        "link_text": link_name,
                    }),
                };
                
                match graph_manager.create_relationship(&rel).await {
                    Ok(_) => {
                        println!("Created LINK relationship: {} -> {} (link: {})", note.title, rel.to_id, link_name);
                        link_count += 1;
                    },
                    Err(e) => eprintln!("Failed to create link relationship: {}", e),
                }
            }
        }
        
        println!("Found {} links in note: {}", link_count, note.title);
        
        Ok(())
    }
    
    async fn extract_and_sync_tags(
        note: &Note,
        content: &str,
        graph_manager: &Arc<dyn GraphManagerTrait>,
    ) -> Result<(), String> {
        println!("Checking note '{}' for tags...", note.title);
        // Extract #tags
        let tag_regex = regex::Regex::new(r"#([a-zA-Z0-9_/\-]+)").unwrap();
        
        let mut tag_count = 0;
        for cap in tag_regex.captures_iter(content) {
            if let Some(tag_text) = cap.get(1) {
                let tag_name = tag_text.as_str();
                
                // Create tag relationship with vault-specific ID
                let rel = super::Relationship {
                    from_id: note.id.clone(),
                    to_id: format!("tag_{}_{}", note.vault_id, tag_name),
                    rel_type: "TAGGED_WITH".to_string(),
                    properties: serde_json::json!({
                        "tag_name": tag_name,
                        "vault_id": note.vault_id,
                    }),
                };
                
                match graph_manager.create_relationship(&rel).await {
                    Ok(_) => println!("Created relationship: {} -> {}", note.id, rel.to_id),
                    Err(e) => eprintln!("Failed to create relationship: {}", e),
                }
            }
        }
        
        Ok(())
    }
    
    fn file_to_note(&self, path: &Path, content: &str, vault_id: &str) -> Result<Note, String> {
        Self::file_to_note_static(path, content, vault_id, self.vault.path())
    }
    
    fn file_to_note_static(
        path: &Path,
        content: &str,
        vault_id: &str,
        vault_path: &Path,
    ) -> Result<Note, String> {
        let relative_path = path.strip_prefix(vault_path)
            .map_err(|_| "Failed to get relative path")?;
        
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();
        
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        
        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
            .flatten()
            .unwrap_or_else(|| Utc::now());
        
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
            .flatten()
            .unwrap_or_else(|| Utc::now());
        
        Ok(Note {
            id: Self::generate_note_id(path, vault_id),
            path: relative_path.to_string_lossy().to_string(),
            title,
            content: content.to_string(),
            created: created.with_timezone(&Utc),
            modified: modified.with_timezone(&Utc),
            vault_id: vault_id.to_string(),
        })
    }
    
    fn generate_note_id(path: &Path, vault_id: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(vault_id.as_bytes());
        hasher.update(path.to_string_lossy().as_bytes());
        format!("{:x}", hasher.finalize())
    }
    
    fn generate_vault_id(&self, vault_path: &Path) -> String {
        crate::vault_id::generate_vault_id(vault_path)
    }
}

// Public function for syncing a single file
pub async fn sync_single_file(
    file_path: &Path,
    vault_path: &Path,
    graph_manager: &Arc<dyn GraphManagerTrait>,
) -> Result<(), String> {
    // Generate vault ID
    let vault_id = crate::vault_id::generate_vault_id(vault_path);
    
    // Only process markdown files
    if file_path.extension().and_then(|s| s.to_str()) != Some("md") {
        return Ok(()); // Skip non-markdown files silently
    }
    
    // Read file content
    let content = std::fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Create note from file
    let note = GraphSyncService::file_to_note_static(file_path, &content, &vault_id, vault_path)?;
    
    // Check if note exists and update or create
    match graph_manager.get_note(&note.id).await {
        Ok(Some(_)) => {
            // Update existing note
            graph_manager.update_note(&note).await
                .map_err(|e| format!("Failed to update note in graph: {}", e))?;
        }
        Ok(None) => {
            // Create new note
            graph_manager.create_note(&note).await
                .map_err(|e| format!("Failed to create note in graph: {}", e))?;
        }
        Err(e) => {
            // Log error but don't fail - we don't want to block saves
            eprintln!("⚠️ Failed to check note existence: {}", e);
        }
    }
    
    Ok(())
}