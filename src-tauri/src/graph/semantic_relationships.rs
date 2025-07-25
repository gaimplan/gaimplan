use std::sync::Arc;
use std::collections::{HashSet, HashMap};
use super::{GraphManagerTrait, Note, Relationship};
use regex::Regex;
use super::debug_logger::debug_log;
use std::env;

#[derive(Debug)]
struct RelationshipConfig {
    threshold_highly_related: f32,
    threshold_related_to: f32,
    threshold_same_domain: f32,
    threshold_cross_domain: f32,
    threshold_loosely_related: f32,
    min_similarity_threshold: f32,
    min_confidence_threshold: f32,
    max_relationships_per_pair: usize,
    max_total_relationships: usize,
}

pub struct SemanticRelationshipBuilder;

impl SemanticRelationshipBuilder {
    // Get configuration from environment variables or use defaults
    fn get_config() -> RelationshipConfig {
        RelationshipConfig {
            threshold_highly_related: env::var("GRAPH_THRESHOLD_HIGHLY_RELATED")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.70),
            threshold_related_to: env::var("GRAPH_THRESHOLD_RELATED_TO")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.40),
            threshold_same_domain: env::var("GRAPH_THRESHOLD_SAME_DOMAIN")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.50),
            threshold_cross_domain: env::var("GRAPH_THRESHOLD_CROSS_DOMAIN")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.60),
            threshold_loosely_related: env::var("GRAPH_THRESHOLD_LOOSELY_RELATED")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.30),
            min_similarity_threshold: env::var("GRAPH_MIN_SIMILARITY_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.30),
            min_confidence_threshold: env::var("GRAPH_MIN_CONFIDENCE_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.30),
            max_relationships_per_pair: env::var("GRAPH_MAX_RELATIONSHIPS_PER_PAIR")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3),
            max_total_relationships: env::var("GRAPH_MAX_TOTAL_RELATIONSHIPS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1000),
        }
    }
    
    // Common English stop words to exclude from keyword extraction
    const STOP_WORDS: &'static [&'static str] = &[
        "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
        "a", "an", "is", "are", "was", "were", "been", "be", "have", "has", "had",
        "do", "does", "did", "will", "would", "could", "should", "may", "might",
        "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they"
    ];
    
    // Domain keywords for classification
    fn get_domain_keywords() -> HashMap<&'static str, Vec<&'static str>> {
        let mut domains = HashMap::new();
        domains.insert("programming", vec!["code", "function", "class", "method", "variable", "api", "implementation", "algorithm", "debug", "compile"]);
        domains.insert("ai_ml", vec!["ai", "machine", "learning", "model", "neural", "training", "dataset", "prediction", "classification", "embedding"]);
        domains.insert("system_design", vec!["system", "architecture", "design", "pattern", "component", "service", "infrastructure", "scalability", "performance"]);
        domains.insert("data", vec!["data", "database", "query", "storage", "analysis", "pipeline", "etl", "warehouse", "schema", "migration"]);
        domains.insert("frontend", vec!["ui", "ux", "component", "react", "vue", "css", "html", "interface", "responsive", "design"]);
        domains.insert("backend", vec!["server", "api", "endpoint", "authentication", "authorization", "rest", "graphql", "microservice", "deployment"]);
        domains.insert("devops", vec!["docker", "kubernetes", "ci", "cd", "deployment", "pipeline", "monitoring", "automation", "infrastructure"]);
        domains.insert("security", vec!["security", "encryption", "authentication", "vulnerability", "attack", "defense", "audit", "compliance", "password"]);
        domains
    }
    
    /// Analyze note content and create relationships based on:
    /// - Shared concepts/entities
    /// - Similar topics
    /// - Temporal proximity
    /// - Common themes
    pub async fn analyze_and_relate_notes(
        notes: Vec<Note>,
        graph_manager: &Arc<dyn GraphManagerTrait>,
    ) -> Result<usize, String> {
        debug_log("\n🔍 SEMANTIC RELATIONSHIP ANALYSIS");
        debug_log("==================================");
        debug_log(&format!("Analyzing {} notes for semantic relationships...", notes.len()));
        
        if notes.is_empty() {
            debug_log("⚠️ No notes to analyze");
            return Ok(0);
        }
        
        // Debug: Print first few note titles
        debug_log("\nNotes to analyze:");
        for (i, note) in notes.iter().take(5).enumerate() {
            debug_log(&format!("  {}. {} (content length: {} chars)", i+1, note.title, note.content.len()));
        }
        if notes.len() > 5 {
            debug_log(&format!("  ... and {} more notes", notes.len() - 5));
        }
        
        let mut total_relationships = 0;
        let mut relationship_counts: HashMap<String, i32> = HashMap::new();
        
        // Get configuration from environment variables
        let config = Self::get_config();
        debug_log(&format!("Using relationship configuration: {:?}", config));
        
        // Analyze all pairs of notes
        let total_pairs = (notes.len() * (notes.len() - 1)) / 2;
        debug_log(&format!("Will analyze {} note pairs", total_pairs));
        
        for i in 0..notes.len() {
            // Check if we've hit the total relationship limit
            if total_relationships >= config.max_total_relationships {
                debug_log(&format!("⚠️ Reached maximum total relationships limit ({}), stopping analysis", config.max_total_relationships));
                break;
            }
            
            for j in (i + 1)..notes.len() {
                let note1 = &notes[i];
                let note2 = &notes[j];
                
                debug_log(&format!("\n📊 Analyzing pair {}/{}: '{}' vs '{}'", 
                    (i * notes.len() + j - (i * (i + 1)) / 2), 
                    total_pairs, 
                    note1.title, 
                    note2.title));
                
                // Extract keywords for both notes
                let keywords1 = Self::extract_keywords(&note1.content);
                let keywords2 = Self::extract_keywords(&note2.content);
                
                debug_log(&format!("  Keywords1: {} words, Keywords2: {} words", keywords1.len(), keywords2.len()));
                
                // Skip if either note has no meaningful keywords
                if keywords1.is_empty() || keywords2.is_empty() {
                    debug_log("  ⚠️ Skipping - one or both notes have no keywords");
                    continue;
                }
                
                // Calculate content similarity
                let similarity = Self::calculate_jaccard_similarity(&keywords1, &keywords2);
                debug_log(&format!("  Jaccard similarity: {:.2}%", similarity * 100.0));
                
                // Skip if similarity is below threshold
                if similarity < config.min_similarity_threshold {
                    debug_log(&format!("  ⚠️ Skipping - similarity {:.2}% below threshold {:.2}%", 
                        similarity * 100.0, config.min_similarity_threshold * 100.0));
                    continue;
                }
                
                // Show some common keywords
                let common: Vec<_> = keywords1.intersection(&keywords2).take(5).cloned().collect();
                if !common.is_empty() {
                    debug_log(&format!("  Common keywords: {:?}", common));
                }
                
                // Collect all potential relationships for this pair
                let mut pair_relationships = Vec::new();
                
                // Determine semantic relationship type
                let relationship = Self::determine_relationship_type(note1, note2, similarity, &keywords1, &keywords2, &config);
                if let Some((rel_type, confidence)) = relationship {
                    if confidence > config.min_confidence_threshold {
                        pair_relationships.push((rel_type, confidence, similarity));
                    }
                }
                
                // Check for temporal proximity
                let time_diff = (note1.modified.timestamp() - note2.modified.timestamp()).abs();
                if time_diff < 3600 { // Within 1 hour
                    pair_relationships.push(("TEMPORAL_PROXIMITY".to_string(), 0.9, similarity));
                }
                
                // Sort by confidence and take only the strongest relationship
                pair_relationships.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
                
                // Create only the strongest relationship (or none if no relationships found)
                for (rel_type, confidence, similarity) in pair_relationships.into_iter().take(config.max_relationships_per_pair) {
                    let rel = Relationship {
                        from_id: note1.id.clone(),
                        to_id: note2.id.clone(),
                        rel_type: rel_type.clone(),
                        properties: serde_json::json!({
                            "confidence": confidence,
                            "similarity": similarity,
                            "method": "semantic_analysis",
                            "keywords_overlap": keywords1.intersection(&keywords2).cloned().collect::<Vec<_>>()
                        }),
                    };
                    
                    match graph_manager.create_relationship(&rel).await {
                        Ok(_) => {
                            debug_log(&format!(
                                "✅ Created {} relationship: '{}' <-> '{}' (confidence: {:.0}%, similarity: {:.0}%)",
                                rel_type, note1.title, note2.title, confidence * 100.0, similarity * 100.0
                            ));
                            total_relationships += 1;
                            *relationship_counts.entry(rel_type).or_insert(0) += 1;
                            
                            // Check if we've hit the limit
                            if total_relationships >= config.max_total_relationships {
                                break;
                            }
                        },
                        Err(e) => {
                            debug_log(&format!("❌ Failed to create relationship: {}", e));
                            debug_log(&format!("  Error details: {:?}", e));
                        }
                    }
                }
            }
        }
        
        // Print summary
        debug_log("\n📊 RELATIONSHIP CREATION SUMMARY");
        debug_log("================================");
        debug_log(&format!("Total relationships created: {}", total_relationships));
        for (rel_type, count) in &relationship_counts {
            debug_log(&format!("  - {}: {}", rel_type, count));
        }
        debug_log("");
        
        let total_relationships: usize = relationship_counts.values().sum::<i32>() as usize;
        Ok(total_relationships)
    }
    
    /// Extract meaningful keywords from text
    fn extract_keywords(text: &str) -> HashSet<String> {
        let text_lower = text.to_lowercase();
        let word_regex = Regex::new(r"\b[a-zA-Z]{3,}\b").unwrap();
        
        let mut keywords = HashSet::new();
        let mut total_words = 0;
        let mut stop_words_filtered = 0;
        
        for word in word_regex.find_iter(&text_lower) {
            total_words += 1;
            let word_str = word.as_str();
            if !Self::STOP_WORDS.contains(&word_str) && word_str.len() >= 3 {
                keywords.insert(word_str.to_string());
            } else {
                stop_words_filtered += 1;
            }
        }
        
        // Debug for first few calls
        static CALL_COUNT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let count = CALL_COUNT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        if count < 10 {
            debug_log(&format!("    extract_keywords: {} total words, {} stop words filtered, {} keywords extracted", 
                total_words, stop_words_filtered, keywords.len()));
            if keywords.len() < 5 {
                debug_log(&format!("      Keywords: {:?}", keywords));
            } else {
                let sample: Vec<_> = keywords.iter().take(5).cloned().collect();
                debug_log(&format!("      Sample keywords: {:?} (and {} more)", sample, keywords.len() - 5));
            }
        }
        
        keywords
    }
    
    /// Calculate Jaccard similarity between two keyword sets
    fn calculate_jaccard_similarity(set1: &HashSet<String>, set2: &HashSet<String>) -> f32 {
        if set1.is_empty() || set2.is_empty() {
            return 0.0;
        }
        
        let intersection = set1.intersection(set2).count() as f32;
        let union = set1.union(set2).count() as f32;
        
        if union == 0.0 {
            0.0
        } else {
            intersection / union
        }
    }
    
    /// Determine relationship type based on content analysis
    fn determine_relationship_type(
        note1: &Note,
        note2: &Note,
        similarity: f32,
        keywords1: &HashSet<String>,
        keywords2: &HashSet<String>,
        config: &RelationshipConfig,
    ) -> Option<(String, f32)> {
        // High similarity indicates related content
        if similarity > config.threshold_highly_related {
            return Some(("HIGHLY_RELATED".to_string(), 0.9));
        } else if similarity > config.threshold_related_to {
            return Some(("RELATED_TO".to_string(), 0.7));
        }
        
        // Check for specific relationship patterns
        let title1_lower = note1.title.to_lowercase();
        let title2_lower = note2.title.to_lowercase();
        
        // Check if one contains the other (hierarchical relationship)
        if title1_lower.contains(&title2_lower) || title2_lower.contains(&title1_lower) {
            return Some(("CONTAINS".to_string(), 0.8));
        }
        
        // Check for domain-based relationships
        let domain1 = Self::classify_domain(keywords1);
        let domain2 = Self::classify_domain(keywords2);
        
        if let (Some(d1), Some(d2)) = (domain1, domain2) {
            if d1 == d2 && similarity > config.threshold_same_domain {
                return Some(("SAME_DOMAIN".to_string(), 0.6));
            } else if d1 != d2 && similarity > config.threshold_cross_domain {
                return Some(("CROSS_DOMAIN".to_string(), 0.7));
            }
        }
        
        // Check for enhancement patterns
        if title1_lower.contains("enhance") || title1_lower.contains("improve") ||
           title2_lower.contains("enhance") || title2_lower.contains("improve") {
            return Some(("ENHANCES".to_string(), 0.6));
        }
        
        // Minimal similarity but some connection
        if similarity > config.threshold_loosely_related {
            return Some(("LOOSELY_RELATED".to_string(), 0.5));
        }
        
        None
    }
    
    /// Classify content into a domain based on keywords
    fn classify_domain(keywords: &HashSet<String>) -> Option<&'static str> {
        let domain_keywords = Self::get_domain_keywords();
        let mut best_domain = None;
        let mut best_score = 0;
        
        for (domain, domain_words) in domain_keywords {
            let score = domain_words.iter()
                .filter(|word| keywords.contains(&word.to_string()))
                .count();
            
            if score > best_score {
                best_score = score;
                best_domain = Some(domain);
            }
        }
        
        if best_score >= 2 { // At least 2 domain keywords
            best_domain
        } else {
            None
        }
    }
}