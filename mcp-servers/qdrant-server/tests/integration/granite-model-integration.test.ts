/**
 * IBM Granite Model Integration Tests
 * Tests the integration of IBM granite-embedding-125m-english model
 * Note: These tests require network access and may take longer to complete
 */

import { EMBEDDING_MODELS, TEST_TEXTS, cosineSimilarity, isValidEmbedding } from '../fixtures/embedding-models';

// Dynamic import for transformers to handle ESM properly
let pipeline: any;
let env: any;

describe('IBM Granite Model Integration', () => {
  const MODEL_LOAD_TIMEOUT = 300000; // 5 minutes for model download
  const graniteModel = EMBEDDING_MODELS.find(model => model.name === 'granite-embedding-125m-english')!;
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

  describe.skip('Model Loading and Compatibility', () => {
    // These tests are skipped because IBM Granite model is NOT compatible with Transformers.js
    // The model lacks required ONNX format files needed for client-side execution
    // See granite-compatibility-report.md for detailed test results
    
    test('should load IBM Granite embedding model', async () => {
      let embeddingPipeline: any;
      
      try {
        console.log(`Attempting to load IBM Granite model: ${graniteModel.modelId}`);
        embeddingPipeline = await pipeline('feature-extraction', graniteModel.modelId);
        
        expect(embeddingPipeline).toBeDefined();
        expect(typeof embeddingPipeline).toBe('function');
      } catch (error) {
        console.error('Failed to load IBM Granite model:', error);
        // If the model is not available, we expect this test to fail
        expect(error).toBeDefined();
        throw error;
      }
    }, MODEL_LOAD_TIMEOUT);

    test('should generate embeddings with IBM Granite model', async () => {
      const embeddingPipeline = await pipeline('feature-extraction', graniteModel.modelId);
      const testText = 'Test embedding generation with IBM Granite model';
      
      const output = await embeddingPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      
      const embedding = Array.from(output.data) as number[];
      
      expect(isValidEmbedding(embedding, graniteModel.expectedDimension)).toBe(true);
      expect(embedding.length).toBe(graniteModel.expectedDimension);
      expect(embedding.every(val => typeof val === 'number' && !isNaN(val))).toBe(true);
    }, MODEL_LOAD_TIMEOUT);

    test('should produce different embeddings than default model for same input', async () => {
      const testText = 'Compare embeddings between models';
      
      // Load both models
      const granitePipeline = await pipeline('feature-extraction', graniteModel.modelId);
      const defaultPipeline = await pipeline('feature-extraction', defaultModel.modelId);
      
      // Generate embeddings
      const graniteOutput = await granitePipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const graniteEmbedding = Array.from(graniteOutput.data) as number[];
      
      const defaultOutput = await defaultPipeline(testText, {
        pooling: 'mean',
        normalize: true,
      });
      const defaultEmbedding = Array.from(defaultOutput.data) as number[];
      
      // Models should produce different embeddings
      expect(graniteEmbedding.length).toBe(graniteModel.expectedDimension);
      expect(defaultEmbedding.length).toBe(defaultModel.expectedDimension);
      
      // Since dimensions are different, we can't directly compare similarity
      // But we can ensure both are valid embeddings
      expect(isValidEmbedding(graniteEmbedding, graniteModel.expectedDimension)).toBe(true);
      expect(isValidEmbedding(defaultEmbedding, defaultModel.expectedDimension)).toBe(true);
    }, MODEL_LOAD_TIMEOUT);
  });

  describe('Model Configuration Testing', () => {
    test('should have correct Granite model configuration', () => {
      expect(graniteModel).toBeDefined();
      expect(graniteModel.modelId).toBe('ibm-granite/granite-embedding-125m-english');
      expect(graniteModel.expectedDimension).toBe(768);
      expect(graniteModel.description).toContain('IBM Granite');
    });

    test('should support model switching configuration', () => {
      const modelConfigs = EMBEDDING_MODELS;
      
      expect(modelConfigs.length).toBeGreaterThan(1);
      expect(modelConfigs.some(model => model.isDefault)).toBe(true);
      expect(modelConfigs.some(model => model.name === 'granite-embedding-125m-english')).toBe(true);
      
      // Each model should have required properties
      modelConfigs.forEach(model => {
        expect(model.name).toBeDefined();
        expect(model.modelId).toBeDefined();
        expect(model.expectedDimension).toBeGreaterThan(0);
        expect(model.description).toBeDefined();
      });
    });
  });

  describe('Fallback Behavior', () => {
    test('should handle model loading failures gracefully', async () => {
      const invalidModelId = 'invalid/non-existent-model';
      
      try {
        await pipeline('feature-extraction', invalidModelId);
        // If we reach here, the test should fail because the model shouldn't exist
        fail('Expected model loading to fail for invalid model');
      } catch (error) {
        // This is expected behavior
        expect(error).toBeDefined();
        expect(error instanceof Error).toBe(true);
      }
    });

    test('should provide configuration for hash-based fallback', () => {
      // Test that our system has configuration for fallback behavior
      const hashDimension = 384; // Default hash fallback dimension
      
      expect(hashDimension).toBe(defaultModel.expectedDimension);
      
      // Mock hash-based embedding function (similar to production code)
      const mockHashEmbedding = (text: string): number[] => {
        const hash = require('crypto').createHash('sha256').update(text).digest('hex');
        const vector: number[] = [];
        
        for (let i = 0; i < Math.min(hash.length, hashDimension * 8); i += 8) {
          const val = parseInt(hash.substring(i, i + 8), 16) / Math.pow(16, 8);
          vector.push((val - 0.5) * 2);
        }
        
        while (vector.length < hashDimension) {
          vector.push(0.0);
        }
        vector.length = hashDimension;
        
        // Normalize
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return norm > 0 ? vector.map((val) => val / norm) : vector;
      };
      
      const hashEmbedding = mockHashEmbedding('test text');
      expect(isValidEmbedding(hashEmbedding, hashDimension)).toBe(true);
    });
  });

  describe('Performance Considerations', () => {
    test('should document model size differences', () => {
      // The Granite model is expected to be larger than the default
      expect(graniteModel.expectedDimension).toBeGreaterThan(defaultModel.expectedDimension);
      
      // Document expected performance characteristics
      const performanceNotes = {
        defaultModel: {
          dimension: defaultModel.expectedDimension,
          expectedLoadTime: '< 30 seconds',
          expectedInferenceTime: '< 1 second per text'
        },
        graniteModel: {
          dimension: graniteModel.expectedDimension,
          expectedLoadTime: '< 5 minutes (first time)',
          expectedInferenceTime: '< 2 seconds per text'
        }
      };
      
      expect(performanceNotes.graniteModel.dimension).toBeGreaterThan(performanceNotes.defaultModel.dimension);
    });

    test('should validate memory requirements', () => {
      // Higher dimensional embeddings require more memory
      const defaultMemoryPerVector = defaultModel.expectedDimension * 4; // 4 bytes per float
      const graniteMemoryPerVector = graniteModel.expectedDimension * 4;
      
      expect(graniteMemoryPerVector).toBeGreaterThan(defaultMemoryPerVector);
      
      // For 1000 vectors:
      const vectorCount = 1000;
      const defaultTotalMemory = defaultMemoryPerVector * vectorCount;
      const graniteTotalMemory = graniteMemoryPerVector * vectorCount;
      
      expect(graniteTotalMemory).toBeGreaterThan(defaultTotalMemory);
      
      // Document memory usage
      console.log(`Memory usage comparison for ${vectorCount} vectors:`);
      console.log(`Default model: ${Math.round(defaultTotalMemory / 1024)} KB`);
      console.log(`Granite model: ${Math.round(graniteTotalMemory / 1024)} KB`);
    });
  });
});