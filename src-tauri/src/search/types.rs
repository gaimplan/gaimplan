use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HybridSearchResult {
    pub file_path: String,
    pub title: String,
    pub relevance_score: f32,
    pub match_type: MatchType,
    pub relationship_path: Option<Vec<String>>,
    pub semantic_score: Option<f32>,
    pub preview: String,
    pub rrf_score: Option<f32>,
    pub graph_rank: Option<usize>,
    pub semantic_rank: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MatchType {
    Direct,        // Exact title/content match
    Tagged,        // Matches via tags
    Linked,        // Connected via links
    Related,       // Graph relationship
    Semantic,      // Vector similarity
    Hybrid,        // Multiple match types
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub mode: SearchMode,
    pub filters: SearchFilters,
    pub options: SearchOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Keyword,
    Semantic,
    Hybrid,
    Graph,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchFilters {
    pub tags: Option<Vec<String>>,
    pub date_range: Option<DateRange>,
    pub file_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    #[serde(default = "default_max_results")]
    pub max_results: usize,
    #[serde(default = "default_include_context")]
    pub include_context: bool,
    #[serde(default = "default_expand_relationships")]
    pub expand_relationships: bool,
    #[serde(default = "default_traversal_depth")]
    pub traversal_depth: usize,
}

fn default_max_results() -> usize { 20 }
fn default_include_context() -> bool { true }
fn default_expand_relationships() -> bool { true }
fn default_traversal_depth() -> usize { 2 }

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            max_results: default_max_results(),
            include_context: default_include_context(),
            expand_relationships: default_expand_relationships(),
            traversal_depth: default_traversal_depth(),
        }
    }
}

// Result types from different search sources
#[derive(Debug, Clone)]
pub struct GraphResult {
    pub file_path: String,
    pub title: String,
    pub match_type: MatchType,
    pub score: f32,
    pub relationship_path: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct SemanticResult {
    pub file_path: String,
    pub title: String,
    pub score: f32,
    pub preview: String,
}

impl HybridSearchResult {
    pub fn from_graph(result: &GraphResult) -> Self {
        Self {
            file_path: result.file_path.clone(),
            title: result.title.clone(),
            relevance_score: result.score,
            match_type: result.match_type.clone(),
            relationship_path: result.relationship_path.clone(),
            semantic_score: None,
            preview: String::new(),
            rrf_score: None,
            graph_rank: None,
            semantic_rank: None,
        }
    }

    pub fn from_semantic(result: &SemanticResult) -> Self {
        Self {
            file_path: result.file_path.clone(),
            title: result.title.clone(),
            relevance_score: result.score,
            match_type: MatchType::Semantic,
            relationship_path: None,
            semantic_score: Some(result.score),
            preview: result.preview.clone(),
            rrf_score: None,
            graph_rank: None,
            semantic_rank: None,
        }
    }

    pub fn set_graph_rank(&mut self, rank: usize) {
        self.graph_rank = Some(rank);
    }

    pub fn set_semantic_rank(&mut self, rank: usize) {
        self.semantic_rank = Some(rank);
    }

    pub fn calculate_match_type(&mut self) {
        if self.graph_rank.is_some() && self.semantic_rank.is_some() {
            self.match_type = MatchType::Hybrid;
        }
    }
}