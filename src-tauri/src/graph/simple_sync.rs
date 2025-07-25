use std::path::Path;
use std::sync::Arc;
use super::{GraphManagerTrait, Note};
use walkdir::WalkDir;
use chrono::Utc;
use sha2::{Sha256, Digest};

pub async fn sync_vault_simple(
    vault_path: &Path,
    graph_manager: &Arc<dyn GraphManagerTrait>,
    vault_id: &str,
    skip_relationships: bool,
) -> Result<(usize, usize), String> {
    println!("Starting simple sync...");
    
    let mut notes = Vec::new();
    let mut file_count = 0;
    
    // Walk the directory with simple settings
    for entry in WalkDir::new(vault_path)
        .follow_links(false)
        .max_depth(5)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        // Only process .md files
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        
        file_count += 1;
        println!("Processing file {}: {}", file_count, path.display());
        
        // Read file content
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(e) => {
                println!("Failed to read {}: {}", path.display(), e);
                continue;
            }
        };
        
        // Create note
        let note = create_note_from_file(path, &content, vault_path, vault_id)?;
        
        // Create note in graph
        graph_manager.create_note(&note).await
            .map_err(|e| format!("Failed to create note: {}", e))?;
            
        // Skip embedding generation during sync
        // Embeddings can be generated on-demand using the Neo4j MCP server
        // which now has local embedding support via @xenova/transformers
            
        notes.push(note);
        
        // Print progress every 10 files
        if file_count % 10 == 0 {
            println!("Progress: {} files processed", file_count);
        }
    }
    
    println!("Created {} notes", notes.len());
    
    let relationship_count = if skip_relationships {
        println!("Skipping relationship building as requested");
        0
    } else {
        println!("Building relationships...");
        
        // Build relationships
        use super::semantic_relationships::SemanticRelationshipBuilder;
        SemanticRelationshipBuilder::analyze_and_relate_notes(
            notes,
            graph_manager
        ).await?
    };
    
    Ok((file_count, relationship_count))
}

fn create_note_from_file(
    path: &Path,
    content: &str,
    vault_path: &Path,
    vault_id: &str,
) -> Result<Note, String> {
    let relative_path = path.strip_prefix(vault_path)
        .map_err(|_| "Failed to get relative path")?;
    
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Failed to get metadata: {}", e))?;
    
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
        .flatten()
        .unwrap_or_else(|| Utc::now());
    
    let created = metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| chrono::DateTime::from_timestamp(d.as_secs() as i64, 0))
        .flatten()
        .unwrap_or_else(|| Utc::now());
    
    // Generate note ID
    let mut hasher = Sha256::new();
    hasher.update(vault_id.as_bytes());
    hasher.update(path.to_string_lossy().as_bytes());
    let id = format!("{:x}", hasher.finalize());
    
    Ok(Note {
        id,
        path: relative_path.to_string_lossy().to_string(),
        title,
        content: content.to_string(),
        created: created.with_timezone(&Utc),
        modified: modified.with_timezone(&Utc),
        vault_id: vault_id.to_string(),
    })
}