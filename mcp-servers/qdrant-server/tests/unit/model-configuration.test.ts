/**
 * Model Configuration Tests
 * Tests the configuration system for switching between embedding models
 */

import { EMBEDDING_MODELS, isValidEmbedding } from '../fixtures/embedding-models';

// Mock environment variable management
const mockEnv = {
  EMBEDDING_MODEL: undefined as string | undefined,
  EMBEDDING_DIMENSION: undefined as string | undefined,
  TRANSFORMERS_CACHE: undefined as string | undefined,
};

// Mock configuration class similar to the production implementation
class EmbeddingModelConfig {
  private _modelId: string;
  private _dimension: number;
  private _cachePath: string;

  constructor() {
    this._modelId = this.getModelFromEnv();
    this._dimension = this.getDimensionFromEnv();
    this._cachePath = this.getCachePathFromEnv();
  }

  private getModelFromEnv(): string {
    const envModel = mockEnv.EMBEDDING_MODEL;
    
    if (envModel) {
      const modelConfig = EMBEDDING_MODELS.find(m => 
        m.modelId === envModel || m.name === envModel
      );
      if (modelConfig) {
        return modelConfig.modelId;
      }
      // If it's not a known model, return the custom model ID as-is
      return envModel;
    }
    
    // Default to the default model
    return EMBEDDING_MODELS.find(m => m.isDefault)!.modelId;
  }

  private getDimensionFromEnv(): number {
    const envDimension = mockEnv.EMBEDDING_DIMENSION;
    
    if (envDimension) {
      const dimension = parseInt(envDimension, 10);
      if (!isNaN(dimension) && dimension > 0) {
        return dimension;
      }
    }
    
    // Infer from model
    const modelConfig = EMBEDDING_MODELS.find(m => m.modelId === this._modelId);
    return modelConfig?.expectedDimension || 384;
  }

  private getCachePathFromEnv(): string {
    return mockEnv.TRANSFORMERS_CACHE || './models';
  }

  get modelId(): string { return this._modelId; }
  get dimension(): number { return this._dimension; }
  get cachePath(): string { return this._cachePath; }

  isValidConfiguration(): boolean {
    const modelConfig = EMBEDDING_MODELS.find(m => m.modelId === this._modelId);
    return !!(modelConfig && this._dimension > 0);
  }

  getModelInfo() {
    const modelConfig = EMBEDDING_MODELS.find(m => m.modelId === this._modelId);
    return {
      modelId: this._modelId,
      dimension: this._dimension,
      cachePath: this._cachePath,
      name: modelConfig?.name || 'unknown',
      description: modelConfig?.description || 'Custom model'
    };
  }
}

describe('Model Configuration', () => {
  beforeEach(() => {
    // Reset mock environment
    mockEnv.EMBEDDING_MODEL = undefined;
    mockEnv.EMBEDDING_DIMENSION = undefined;
    mockEnv.TRANSFORMERS_CACHE = undefined;
  });

  describe('Default Configuration', () => {
    test('should use default model when no environment variables set', () => {
      const config = new EmbeddingModelConfig();
      const defaultModel = EMBEDDING_MODELS.find(m => m.isDefault)!;
      
      expect(config.modelId).toBe(defaultModel.modelId);
      expect(config.dimension).toBe(defaultModel.expectedDimension);
      expect(config.isValidConfiguration()).toBe(true);
    });

    test('should use default cache path when not specified', () => {
      const config = new EmbeddingModelConfig();
      expect(config.cachePath).toBe('./models');
    });

    test('should provide valid model information', () => {
      const config = new EmbeddingModelConfig();
      const info = config.getModelInfo();
      
      expect(info.modelId).toBeDefined();
      expect(info.dimension).toBeGreaterThan(0);
      expect(info.name).toBeDefined();
      expect(info.description).toBeDefined();
    });
  });

  describe('Environment Variable Configuration', () => {
    test('should use environment model by ID', () => {
      const graniteModel = EMBEDDING_MODELS.find(m => m.name === 'granite-embedding-125m-english')!;
      mockEnv.EMBEDDING_MODEL = graniteModel.modelId;
      
      const config = new EmbeddingModelConfig();
      expect(config.modelId).toBe(graniteModel.modelId);
      expect(config.dimension).toBe(graniteModel.expectedDimension);
    });

    test('should use environment model by name', () => {
      const graniteModel = EMBEDDING_MODELS.find(m => m.name === 'granite-embedding-125m-english')!;
      mockEnv.EMBEDDING_MODEL = graniteModel.name;
      
      const config = new EmbeddingModelConfig();
      expect(config.modelId).toBe(graniteModel.modelId);
      expect(config.dimension).toBe(graniteModel.expectedDimension);
    });

    test('should override dimension when specified', () => {
      const customDimension = 512;
      mockEnv.EMBEDDING_DIMENSION = customDimension.toString();
      
      const config = new EmbeddingModelConfig();
      expect(config.dimension).toBe(customDimension);
    });

    test('should use custom cache path', () => {
      const customPath = '/custom/cache/path';
      mockEnv.TRANSFORMERS_CACHE = customPath;
      
      const config = new EmbeddingModelConfig();
      expect(config.cachePath).toBe(customPath);
    });

    test('should use custom model name when specified', () => {
      const customModel = 'non-existent-model';
      mockEnv.EMBEDDING_MODEL = customModel;
      
      const config = new EmbeddingModelConfig();
      
      // Should use the custom model name as-is
      expect(config.modelId).toBe(customModel);
      // Should fallback to default dimension since model is unknown
      const defaultModel = EMBEDDING_MODELS.find(m => m.isDefault)!;
      expect(config.dimension).toBe(defaultModel.expectedDimension);
    });

    test('should fallback to default for invalid dimension', () => {
      mockEnv.EMBEDDING_DIMENSION = 'invalid-number';
      
      const config = new EmbeddingModelConfig();
      const defaultModel = EMBEDDING_MODELS.find(m => m.isDefault)!;
      
      expect(config.dimension).toBe(defaultModel.expectedDimension);
    });
  });

  describe('Model Validation', () => {
    test('should validate known models', () => {
      EMBEDDING_MODELS.forEach(model => {
        mockEnv.EMBEDDING_MODEL = model.modelId;
        const config = new EmbeddingModelConfig();
        
        expect(config.isValidConfiguration()).toBe(true);
        expect(config.dimension).toBeGreaterThan(0);
      });
    });

    test('should handle dimension validation', () => {
      // Test various dimension values
      const testDimensions = [1, 128, 384, 512, 768, 1024, 2048];
      
      testDimensions.forEach(dim => {
        mockEnv.EMBEDDING_DIMENSION = dim.toString();
        const config = new EmbeddingModelConfig();
        
        expect(config.dimension).toBe(dim);
        expect(config.isValidConfiguration()).toBe(true);
      });
    });

    test('should reject invalid dimensions', () => {
      const invalidDimensions = ['0', '-1', 'abc', ''];
      
      invalidDimensions.forEach(dim => {
        mockEnv.EMBEDDING_DIMENSION = dim;
        const config = new EmbeddingModelConfig();
        
        // Should fallback to default
        const defaultModel = EMBEDDING_MODELS.find(m => m.isDefault)!;
        expect(config.dimension).toBe(defaultModel.expectedDimension);
      });
    });
  });

  describe('Configuration Information', () => {
    test('should provide complete model information', () => {
      EMBEDDING_MODELS.forEach(model => {
        mockEnv.EMBEDDING_MODEL = model.modelId;
        const config = new EmbeddingModelConfig();
        const info = config.getModelInfo();
        
        expect(info.modelId).toBe(model.modelId);
        expect(info.name).toBe(model.name);
        expect(info.description).toBe(model.description);
        expect(info.dimension).toBe(model.expectedDimension);
        expect(info.cachePath).toBeDefined();
      });
    });

    test('should handle custom model configurations', () => {
      const customModelId = 'custom/unknown-model';
      const customDimension = 999;
      
      mockEnv.EMBEDDING_MODEL = customModelId;
      mockEnv.EMBEDDING_DIMENSION = customDimension.toString();
      
      const config = new EmbeddingModelConfig();
      const info = config.getModelInfo();
      
      // Should use custom values but show unknown for name
      expect(info.modelId).toBe(customModelId);
      expect(info.dimension).toBe(customDimension);
      expect(info.name).toBe('unknown');
      expect(info.description).toBe('Custom model');
    });
  });

  describe('Hash Fallback Configuration', () => {
    test('should configure hash fallback correctly', () => {
      // Test hash-based fallback embedding generation
      const hashEmbeddingGenerator = (text: string, dimension: number): number[] => {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        const vector: number[] = [];
        
        for (let i = 0; i < Math.min(hash.length, dimension * 8); i += 8) {
          const val = parseInt(hash.substring(i, i + 8), 16) / Math.pow(16, 8);
          vector.push((val - 0.5) * 2);
        }
        
        while (vector.length < dimension) {
          vector.push(0.0);
        }
        vector.length = dimension;
        
        // Normalize
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return norm > 0 ? vector.map((val) => val / norm) : vector;
      };
      
      EMBEDDING_MODELS.forEach(model => {
        const hashEmbedding = hashEmbeddingGenerator('test text', model.expectedDimension);
        expect(isValidEmbedding(hashEmbedding, model.expectedDimension)).toBe(true);
      });
    });

    test('should maintain consistent hash embeddings', () => {
      const hashEmbeddingGenerator = (text: string, dimension: number): number[] => {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        const vector: number[] = [];
        
        for (let i = 0; i < Math.min(hash.length, dimension * 8); i += 8) {
          const val = parseInt(hash.substring(i, i + 8), 16) / Math.pow(16, 8);
          vector.push((val - 0.5) * 2);
        }
        
        while (vector.length < dimension) {
          vector.push(0.0);
        }
        vector.length = dimension;
        
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return norm > 0 ? vector.map((val) => val / norm) : vector;
      };
      
      const text = 'consistency test';
      const dimension = 384;
      
      const embedding1 = hashEmbeddingGenerator(text, dimension);
      const embedding2 = hashEmbeddingGenerator(text, dimension);
      
      expect(embedding1).toEqual(embedding2);
    });
  });
});