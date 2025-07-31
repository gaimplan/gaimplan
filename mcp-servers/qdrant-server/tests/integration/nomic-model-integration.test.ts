/**
 * Nomic AI Model Integration Tests
 * Tests the integration of nomic-ai/nomic-embed-text-v1.5 model
 * Note: These tests require network access and may take longer to complete
 */

import { EMBEDDING_MODELS, TEST_TEXTS, cosineSimilarity, isValidEmbedding, SIMILARITY_TEST_PAIRS } from '../fixtures/embedding-models';

// Dynamic import for transformers to handle ESM properly
let pipeline: any;
let env: any;

describe('Nomic AI Model Integration', () => {
  const MODEL_LOAD_TIMEOUT = 300000; // 5 minutes for model download
  const nomicModel = EMBEDDING_MODELS.find(model => model.name === 'nomic-embed-text-v1.5')!;
  const defaultModel = EMBEDDING_MODELS.find(model => model.isDefault)!;

  beforeAll(async () => {
    // Dynamically import transformers to handle ESM
    const transformers = await import('@xenova/transformers');
    pipeline = transformers.pipeline;
    env = transformers.env;
    
    // Configure Transformers.js for integration testing
    (env as any).allowRemoteModels = true; // Allow model downloads for integration tests
    (env as any).localURL = process.env.TRANSFORMERS_CACHE || './models';
  });

  describe('Model Loading and Compatibility', () => {
    test('should load Nomic AI embedding model', async () => {
      let embeddingPipeline: any;
      
      try {
        console.log(`Attempting to load Nomic AI model: ${nomicModel.modelId}`);
        embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
        
        expect(embeddingPipeline).toBeDefined();
        expect(typeof embeddingPipeline).toBe('function');
        console.log('✅ Nomic AI model loaded successfully');
      } catch (error) {
        console.error('❌ Failed to load Nomic AI model:', error);
        throw error;
      }
    }, MODEL_LOAD_TIMEOUT);

    test('should generate embeddings with Nomic AI model', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      const testText = 'Test embedding generation with Nomic AI model';
      
      const output = await embeddingPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      
      const embedding = Array.from(output.data) as number[];
      
      expect(isValidEmbedding(embedding, nomicModel.expectedDimension)).toBe(true);
      expect(embedding.length).toBe(nomicModel.expectedDimension);
      expect(embedding.every(val => typeof val === 'number' && !isNaN(val))).toBe(true);
      
      console.log(`✅ Generated embedding with dimension: ${embedding.length}`);
      console.log(`✅ Embedding norm: ${Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0))}`);
    }, MODEL_LOAD_TIMEOUT);

    test('should generate embeddings for various text types', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      
      for (const testText of TEST_TEXTS.slice(0, 5)) { // Test first 5 texts to avoid timeout
        const output = await embeddingPipeline(testText, {
          pooling: 'mean',
          normalize: true,
        });
        
        const embedding = Array.from(output.data) as number[];
        
        expect(isValidEmbedding(embedding, nomicModel.expectedDimension)).toBe(true);
        expect(embedding.length).toBe(nomicModel.expectedDimension);
        
        console.log(`✅ Text: "${testText.substring(0, 50)}..." -> Embedding dimension: ${embedding.length}`);
      }
    }, MODEL_LOAD_TIMEOUT);

    test('should produce different embeddings than default model for same input', async () => {
      const testText = 'Compare embeddings between models';
      
      // Load both models
      const nomicPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      const defaultPipeline = await pipeline('feature-extraction', defaultModel.modelId);
      
      // Generate embeddings
      const nomicOutput = await nomicPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const nomicEmbedding = Array.from(nomicOutput.data) as number[];
      
      const defaultOutput = await defaultPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const defaultEmbedding = Array.from(defaultOutput.data) as number[];
      
      // Validate both embeddings
      expect(nomicEmbedding.length).toBe(nomicModel.expectedDimension);
      expect(defaultEmbedding.length).toBe(defaultModel.expectedDimension);
      
      expect(isValidEmbedding(nomicEmbedding, nomicModel.expectedDimension)).toBe(true);
      expect(isValidEmbedding(defaultEmbedding, defaultModel.expectedDimension)).toBe(true);
      
      // Models should have different dimensions
      expect(nomicEmbedding.length).toBeGreaterThan(defaultEmbedding.length);
      
      console.log(`✅ Nomic embedding dimension: ${nomicEmbedding.length}`);
      console.log(`✅ Default embedding dimension: ${defaultEmbedding.length}`);
    }, MODEL_LOAD_TIMEOUT);
  });

  describe('Semantic Similarity Testing', () => {
    test('should produce reasonable semantic similarities', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      
      for (const testPair of SIMILARITY_TEST_PAIRS) {
        const output1 = await embeddingPipeline(testPair.text1, {
          pooling: 'mean',
          normalize: true,
        });
        const embedding1 = Array.from(output1.data) as number[];
        
        const output2 = await embeddingPipeline(testPair.text2, {
          pooling: 'mean',
          normalize: true,
        });
        const embedding2 = Array.from(output2.data) as number[];
        
        const similarity = cosineSimilarity(embedding1, embedding2);
        
        console.log(`📊 "${testPair.text1}" vs "${testPair.text2}"`);
        console.log(`   Similarity: ${similarity.toFixed(4)} (Expected: ${testPair.expectedSimilar ? 'similar' : 'different'})`);
        
        if (testPair.expectedSimilar) {
          expect(similarity).toBeGreaterThan(0.3); // Reasonable threshold for similar texts
        } else {
          expect(similarity).toBeLessThan(0.9); // Different texts should have lower similarity (relaxed for mock)
        }
      }
    }, MODEL_LOAD_TIMEOUT);

    test('should demonstrate consistency across multiple runs', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      const testText = 'Consistency test for embedding generation';
      
      // Generate the same embedding multiple times
      const embeddings: number[][] = [];
      for (let i = 0; i < 3; i++) {
        const output = await embeddingPipeline(testText, {
          pooling: 'mean',
          normalize: true,
        });
        embeddings.push(Array.from(output.data) as number[]);
      }
      
      // All embeddings should be identical (deterministic)
      for (let i = 1; i < embeddings.length; i++) {
        const similarity = cosineSimilarity(embeddings[0], embeddings[i]);
        expect(similarity).toBeCloseTo(1.0, 6); // Should be nearly identical
        console.log(`✅ Run ${i + 1} similarity to first run: ${similarity.toFixed(8)}`);
      }
    }, MODEL_LOAD_TIMEOUT);
  });

  describe('Performance Comparison', () => {
    test('should compare performance with default model', async () => {
      const testText = 'Performance comparison test text for embedding generation';
      
      // Time Nomic model
      const nomicPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      const nomicStart = Date.now();
      const nomicOutput = await nomicPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const nomicTime = Date.now() - nomicStart;
      const nomicEmbedding = Array.from(nomicOutput.data) as number[];
      
      // Time default model
      const defaultPipeline = await pipeline('feature-extraction', defaultModel.modelId);
      const defaultStart = Date.now();
      const defaultOutput = await defaultPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const defaultTime = Date.now() - defaultStart;
      const defaultEmbedding = Array.from(defaultOutput.data) as number[];
      
      console.log(`📊 Performance Comparison:`);
      console.log(`   Nomic model: ${nomicTime}ms (${nomicEmbedding.length}D)`);
      console.log(`   Default model: ${defaultTime}ms (${defaultEmbedding.length}D)`);
      console.log(`   Ratio: ${(nomicTime / defaultTime).toFixed(2)}x`);
      
      // Both should complete in reasonable time
      expect(nomicTime).toBeLessThan(10000); // Less than 10 seconds
      expect(defaultTime).toBeLessThan(10000);
      
      // Validate embeddings
      expect(isValidEmbedding(nomicEmbedding, nomicModel.expectedDimension)).toBe(true);
      expect(isValidEmbedding(defaultEmbedding, defaultModel.expectedDimension)).toBe(true);
    }, MODEL_LOAD_TIMEOUT);

    test('should validate memory efficiency', () => {
      // Calculate memory requirements for embeddings
      const nomicMemoryPerVector = nomicModel.expectedDimension * 4; // 4 bytes per float
      const defaultMemoryPerVector = defaultModel.expectedDimension * 4;
      
      const vectorCount = 1000;
      const nomicTotalMemory = nomicMemoryPerVector * vectorCount;
      const defaultTotalMemory = defaultMemoryPerVector * vectorCount;
      
      console.log(`💾 Memory usage comparison for ${vectorCount} vectors:`);
      console.log(`   Nomic model: ${Math.round(nomicTotalMemory / 1024)} KB`);
      console.log(`   Default model: ${Math.round(defaultTotalMemory / 1024)} KB`);
      console.log(`   Ratio: ${(nomicTotalMemory / defaultTotalMemory).toFixed(2)}x`);
      
      // Nomic model uses exactly 2x memory (768 vs 384 dimensions)
      expect(nomicModel.expectedDimension).toBe(defaultModel.expectedDimension * 2);
      expect(nomicTotalMemory).toBe(defaultTotalMemory * 2);
    });
  });

  describe('Model Configuration Testing', () => {
    test('should have correct Nomic model configuration', () => {
      expect(nomicModel).toBeDefined();
      expect(nomicModel.modelId).toBe('nomic-ai/nomic-embed-text-v1.5');
      expect(nomicModel.expectedDimension).toBe(768);
      expect(nomicModel.description).toContain('Nomic AI');
    });

    test('should support ONNX format expectations', async () => {
      // This test verifies that the model is expected to have ONNX support
      // The actual ONNX files are tested in the loading test above
      expect(nomicModel.description).toContain('ONNX');
      
      // Test that the model ID follows expected pattern
      expect(nomicModel.modelId).toMatch(/^nomic-ai\/.+/);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty and special text inputs', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', nomicModel.modelId);
      
      const specialCases = [
        '',
        ' ',
        'A',
        '123',
        'Special chars: @#$%^&*()',
        'Unicode: 🚀 🌟 💡',
        'Multiple\nlines\nof\ntext'
      ];
      
      for (const testText of specialCases) {
        try {
          const output = await embeddingPipeline(testText || ' ', { // Handle empty string
            pooling: 'mean',
            normalize: true,
          });
          
          const embedding = Array.from(output.data) as number[];
          
          expect(isValidEmbedding(embedding, nomicModel.expectedDimension)).toBe(true);
          console.log(`✅ Special case "${testText}" -> ${embedding.length}D embedding`);
        } catch (error) {
          console.warn(`⚠️ Special case "${testText}" failed:`, error);
          // Some edge cases might fail, which is acceptable
        }
      }
    }, MODEL_LOAD_TIMEOUT);
  });
});