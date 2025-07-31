/**
 * Test fixtures for embedding model configurations and test data
 */

export interface EmbeddingModelConfig {
  name: string;
  modelId: string;
  expectedDimension: number;
  description: string;
  isDefault?: boolean;
}

export const EMBEDDING_MODELS: EmbeddingModelConfig[] = [
  {
    name: 'all-MiniLM-L6-v2',
    modelId: 'Xenova/all-MiniLM-L6-v2',
    expectedDimension: 384,
    description: 'Current default model - Sentence transformer',
    isDefault: true
  },
  {
    name: 'granite-embedding-125m-english',
    modelId: 'ibm-granite/granite-embedding-125m-english',
    expectedDimension: 768, // Expected dimension for granite model
    description: 'IBM Granite embedding model for testing'
  },
  {
    name: 'nomic-embed-text-v1.5',
    modelId: 'nomic-ai/nomic-embed-text-v1.5',
    expectedDimension: 768, // Expected dimension for nomic model
    description: 'Nomic AI embedding model with ONNX support for testing'
  }
];

export const TEST_TEXTS = [
  'Hello world',
  'This is a test sentence for embedding generation.',
  'Machine learning models can generate vector representations of text.',
  'The quick brown fox jumps over the lazy dog.',
  'Semantic similarity is computed using cosine distance between vectors.',
  'Knowledge graphs and vector databases enable powerful retrieval systems.',
  // Longer text
  'In the field of natural language processing, embeddings are dense vector representations that capture semantic meaning. These vectors enable machines to understand and process human language in a mathematically meaningful way.',
  // Empty and edge cases
  '',
  'A',
  '123',
  'Special characters: @#$%^&*()',
  'Multiple\nlines\nof\ntext'
];

export const SIMILARITY_TEST_PAIRS = [
  {
    text1: 'The cat sat on the mat',
    text2: 'A feline rested on the rug',
    expectedSimilar: true,
    description: 'Semantically similar sentences'
  },
  {
    text1: 'Machine learning is powerful',
    text2: 'Artificial intelligence can be useful',
    expectedSimilar: true,
    description: 'Related concepts'
  },
  {
    text1: 'I love pizza',
    text2: 'The weather is sunny today',
    expectedSimilar: false,
    description: 'Unrelated sentences'
  },
  {
    text1: 'Database systems store information',
    text2: 'Vector databases enable semantic search',
    expectedSimilar: true,
    description: 'Related technical concepts'
  }
];

export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

export function isValidEmbedding(embedding: number[], expectedDimension: number): boolean {
  // Check if embedding is an array of numbers with correct dimension
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== expectedDimension) return false;
  if (!embedding.every(val => typeof val === 'number' && !isNaN(val))) return false;
  
  // Check if embedding is normalized (optional, but good practice)
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  
  // Allow some tolerance for floating point precision
  return norm > 0.1 && norm < 10; // Reasonable range for embeddings
}