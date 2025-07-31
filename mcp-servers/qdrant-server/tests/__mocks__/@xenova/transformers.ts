/**
 * Mock implementation of @xenova/transformers for testing
 * This allows us to test the logic without loading actual ML models
 */

export const env = {
  localURL: './models',
  allowRemoteModels: true
};

// Mock embedding outputs for known models
const MOCK_EMBEDDINGS = {
  'Xenova/all-MiniLM-L6-v2': {
    dimension: 384,
    generateEmbedding: (text: string) => {
      // Handle empty text
      if (!text || text.trim().length === 0) {
        // Return a small random vector for empty text
        const embedding = Array.from({ length: 384 }, (_, i) => (Math.sin(i) * 0.1));
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => val / norm);
      }
      
      // Generate more realistic mock embedding based on text content and structure
      const words = text.toLowerCase().split(/\s+/);
      const wordFeatures: number[] = [];
      
      // Generate features based on word characteristics
      for (let i = 0; i < 384; i++) {
        let feature = 0;
        
        // Different features based on text characteristics
        if (i < 100) {
          // Length and structure features
          feature = (text.length % 100) / 100 - 0.5;
        } else if (i < 200) {
          // Word-based features
          const wordIndex = i - 100;
          if (wordIndex < words.length && words[wordIndex]) {
            const word = words[wordIndex];
            feature = (word.charCodeAt(0) / 128) - 0.5;
          } else {
            feature = 0;
          }
        } else {
          // Hash-based features for diversity
          const hash = require('crypto').createHash('md5').update(`${text}:${i}`).digest('hex');
          const charCode = hash.charCodeAt(i % hash.length);
          feature = (charCode / 255) - 0.5;
        }
        
        wordFeatures.push(feature);
      }
      
      // Normalize
      const norm = Math.sqrt(wordFeatures.reduce((sum, val) => sum + val * val, 0));
      return norm > 0 ? wordFeatures.map(val => val / norm) : wordFeatures;
    }
  },
  'ibm-granite/granite-embedding-125m-english': {
    dimension: 768,
    generateEmbedding: (text: string) => {
      // Generate different mock embedding for Granite model
      const hash = require('crypto').createHash('sha256').update(`granite:${text}`).digest('hex');
      const embedding: number[] = [];
      
      for (let i = 0; i < 768; i++) {
        const charCode = hash.charCodeAt(i % hash.length);
        embedding.push(((charCode / 255) - 0.5) * 1.5); // Slightly different range
      }
      
      // Normalize
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return embedding.map(val => val / norm);
    }
  },
  'nomic-ai/nomic-embed-text-v1.5': {
    dimension: 768,
    generateEmbedding: (text: string) => {
      // Generate mock embedding for Nomic model with different characteristics
      const hash = require('crypto').createHash('sha256').update(`nomic:${text}`).digest('hex');
      const embedding: number[] = [];
      
      // Use a different algorithm to make it distinguishable from Granite
      for (let i = 0; i < 768; i++) {
        const byte1 = hash.charCodeAt(i % hash.length);
        const byte2 = hash.charCodeAt((i + 1) % hash.length);
        const combined = (byte1 * 256 + byte2) / 65536; // 0-1 range
        embedding.push((combined - 0.5) * 2); // -1 to 1 range
      }
      
      // Normalize
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      return norm > 0 ? embedding.map(val => val / norm) : embedding;
    }
  }
};

export async function pipeline(task: string, modelId: string): Promise<(text: string, options?: any) => Promise<{ data: Float32Array }>> {
  if (task !== 'feature-extraction') {
    throw new Error(`Mock: Task ${task} not supported`);
  }
  
  // Simulate model loading delay for unknown models
  if (!MOCK_EMBEDDINGS[modelId as keyof typeof MOCK_EMBEDDINGS]) {
    throw new Error(`Mock: Model ${modelId} not available`);
  }
  
  // Simulate network delay for model loading
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Return a function that generates embeddings
  return async (text: string, options?: any): Promise<{ data: Float32Array }> => {
    const mockData = MOCK_EMBEDDINGS[modelId as keyof typeof MOCK_EMBEDDINGS];
    if (!mockData) {
      throw new Error(`Mock: Model ${modelId} not supported`);
    }
    
    const embedding = mockData.generateEmbedding(text);
    return {
      data: new Float32Array(embedding)
    };
  };
}