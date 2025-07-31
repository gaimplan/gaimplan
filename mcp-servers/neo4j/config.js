/**
 * Embedding Model Configuration
 * 
 * This configuration allows switching between different embedding models.
 * The default is now Nomic AI's nomic-embed-text-v1.5 for better semantic quality.
 */

export const EMBEDDING_MODELS = {
  'nomic-ai/nomic-embed-text-v1.5': {
    modelName: 'nomic-ai/nomic-embed-text-v1.5',
    dimensions: 768,
    description: 'Nomic AI embedding model with superior semantic quality',
    performance: '~5.4ms per embedding'
  },
  'Xenova/all-MiniLM-L6-v2': {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    description: 'Lightweight embedding model with good performance',
    performance: '~1.6ms per embedding'
  }
};

// Default model - can be overridden by environment variable
export const DEFAULT_MODEL = 'nomic-ai/nomic-embed-text-v1.5';

export function getEmbeddingConfig() {
  const modelName = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
  const config = EMBEDDING_MODELS[modelName];
  
  if (!config) {
    console.error(`Unknown embedding model: ${modelName}, falling back to default`);
    return EMBEDDING_MODELS[DEFAULT_MODEL];
  }
  
  return config;
}