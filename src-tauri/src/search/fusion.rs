use std::collections::HashMap;
use crate::search::types::{HybridSearchResult, GraphResult, SemanticResult};

pub struct FusionConfig {
    pub k: f32,
    pub graph_weight: f32,
    pub semantic_weight: f32,
}

impl Default for FusionConfig {
    fn default() -> Self {
        Self {
            k: 60.0,  // Optimal constant from research
            graph_weight: 1.0,
            semantic_weight: 1.0,
        }
    }
}

pub struct ResultFusion {
    config: FusionConfig,
}

impl ResultFusion {
    pub fn new(config: FusionConfig) -> Self {
        Self { config }
    }

    pub fn with_default_config() -> Self {
        Self::new(FusionConfig::default())
    }

    /// Fuse results using Reciprocal Rank Fusion (RRF) algorithm
    pub fn fuse_results_rrf(
        &self,
        graph_results: Vec<GraphResult>,
        semantic_results: Vec<SemanticResult>,
    ) -> Vec<HybridSearchResult> {
        let mut rrf_scores: HashMap<String, f32> = HashMap::new();
        let mut result_details: HashMap<String, HybridSearchResult> = HashMap::new();

        // Calculate RRF scores for graph results
        for (rank, result) in graph_results.iter().enumerate() {
            let score = 1.0 / (rank as f32 + 1.0 + self.config.k);
            rrf_scores
                .entry(result.file_path.clone())
                .and_modify(|s| *s += score * self.config.graph_weight)
                .or_insert(score * self.config.graph_weight);

            result_details
                .entry(result.file_path.clone())
                .or_insert_with(|| HybridSearchResult::from_graph(result))
                .set_graph_rank(rank + 1);
        }

        // Calculate RRF scores for semantic results
        for (rank, result) in semantic_results.iter().enumerate() {
            let score = 1.0 / (rank as f32 + 1.0 + self.config.k);
            rrf_scores
                .entry(result.file_path.clone())
                .and_modify(|s| *s += score * self.config.semantic_weight)
                .or_insert(score * self.config.semantic_weight);

            result_details
                .entry(result.file_path.clone())
                .and_modify(|r| {
                    r.set_semantic_rank(rank + 1);
                    r.semantic_score = Some(result.score);
                    if r.preview.is_empty() {
                        r.preview = result.preview.clone();
                    }
                })
                .or_insert_with(|| {
                    let mut hybrid_result = HybridSearchResult::from_semantic(result);
                    hybrid_result.set_semantic_rank(rank + 1);
                    hybrid_result
                });
        }

        // Combine scores and sort by RRF score
        let mut results: Vec<HybridSearchResult> = result_details
            .into_iter()
            .map(|(path, mut result)| {
                result.rrf_score = Some(rrf_scores[&path]);
                result.calculate_match_type();
                result
            })
            .collect();

        results.sort_by(|a, b| {
            b.rrf_score
                .unwrap_or(0.0)
                .partial_cmp(&a.rrf_score.unwrap_or(0.0))
                .unwrap()
        });

        results
    }

    /// Weighted RRF for future enhancement with customizable weights
    pub fn fuse_results_weighted_rrf(
        &self,
        graph_results: Vec<GraphResult>,
        semantic_results: Vec<SemanticResult>,
        custom_weights: Option<(f32, f32)>,
    ) -> Vec<HybridSearchResult> {
        let (graph_weight, semantic_weight) = custom_weights
            .unwrap_or((self.config.graph_weight, self.config.semantic_weight));

        let config = FusionConfig {
            k: self.config.k,
            graph_weight,
            semantic_weight,
        };

        let fusion = ResultFusion::new(config);
        fusion.fuse_results_rrf(graph_results, semantic_results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::search::types::MatchType;

    #[test]
    fn test_rrf_fusion() {
        let fusion = ResultFusion::with_default_config();

        let graph_results = vec![
            GraphResult {
                file_path: "note1.md".to_string(),
                title: "Note 1".to_string(),
                match_type: MatchType::Direct,
                score: 1.0,
                relationship_path: None,
            },
            GraphResult {
                file_path: "note2.md".to_string(),
                title: "Note 2".to_string(),
                match_type: MatchType::Tagged,
                score: 0.8,
                relationship_path: None,
            },
        ];

        let semantic_results = vec![
            SemanticResult {
                file_path: "note2.md".to_string(),
                title: "Note 2".to_string(),
                score: 0.9,
                preview: "Preview of note 2".to_string(),
            },
            SemanticResult {
                file_path: "note3.md".to_string(),
                title: "Note 3".to_string(),
                score: 0.7,
                preview: "Preview of note 3".to_string(),
            },
        ];

        let results = fusion.fuse_results_rrf(graph_results, semantic_results);

        // Note 2 should rank highest as it appears in both result sets
        assert_eq!(results[0].file_path, "note2.md");
        assert_eq!(results[0].match_type, MatchType::Hybrid);
        assert!(results[0].rrf_score.is_some());
    }
}