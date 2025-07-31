# Qdrant Server Test Suite

This directory contains comprehensive tests for the Qdrant MCP Server, focusing on embedding model compatibility and configuration management.

## Test Structure

```
tests/
├── __mocks__/                  # Mock implementations
│   └── @xenova/transformers.ts  # Transformers.js mock for testing
├── fixtures/                   # Test data and utilities
│   └── embedding-models.ts      # Model configurations and test data
├── integration/                 # Integration tests
│   └── granite-model-integration.test.ts  # IBM Granite model tests
├── unit/                       # Unit tests
│   ├── setup.test.ts           # Basic Jest setup verification
│   ├── embedding-model-compatibility.test.ts  # Core embedding tests
│   └── model-configuration.test.ts            # Configuration management tests
└── setup.ts                   # Global test setup and utilities
```

## Test Categories

### 1. Test Infrastructure (`setup.test.ts`)
- Verifies Jest configuration
- Tests global test utilities
- Ensures testing environment is properly set up

### 2. Embedding Model Compatibility (`embedding-model-compatibility.test.ts`)
- **Model Loading**: Tests ability to load different embedding models
- **Embedding Generation**: Validates embedding generation for various text inputs
- **Semantic Similarity**: Tests cosine similarity calculations
- **Performance**: Checks embedding generation speed and batch processing

### 3. Model Configuration (`model-configuration.test.ts`)
- **Default Configuration**: Tests default model selection
- **Environment Variables**: Tests configuration via environment variables
- **Model Validation**: Validates model and dimension configurations
- **Fallback Behavior**: Tests hash-based fallback when models fail to load

### 4. IBM Granite Integration (`granite-model-integration.test.ts`)
- **Model Loading**: Tests IBM Granite model loading (skipped by default)
- **Embedding Comparison**: Compares output between models
- **Performance Analysis**: Documents memory and performance characteristics
- **Fallback Testing**: Tests graceful degradation scenarios

## Supported Models

### Default Model
- **Name**: `all-MiniLM-L6-v2`
- **Model ID**: `Xenova/all-MiniLM-L6-v2`
- **Dimension**: 384
- **Status**: ✅ Tested and supported

### Alternative Models
- **Name**: `granite-embedding-125m-english`
- **Model ID**: `ibm-granite/granite-embedding-125m-english`
- **Dimension**: 768
- **Status**: 🧪 Experimental (tests skipped by default)

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suites
```bash
# Unit tests only
npm test tests/unit/

# Integration tests only
npm test tests/integration/

# With coverage
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

## Test Configuration

### Environment Variables for Testing
```bash
# Override embedding model
EMBEDDING_MODEL=ibm-granite/granite-embedding-125m-english

# Override embedding dimension
EMBEDDING_DIMENSION=768

# Set cache directory
TRANSFORMERS_CACHE=./models
```

### Jest Configuration
- **Preset**: `ts-jest` for TypeScript support
- **Environment**: Node.js
- **Timeout**: 30 seconds (for model loading)
- **Max Workers**: 1 (sequential execution for resource management)
- **Mocks**: Transformers.js library mocked for reliable testing

## Mock Implementation

The test suite uses a mock implementation of `@xenova/transformers` that:
- Generates deterministic embeddings for consistent testing
- Simulates model loading delays
- Supports multiple model configurations
- Handles edge cases (empty text, invalid models)

### Mock Features
- **Deterministic**: Same input always produces same output
- **Realistic Structure**: Embeddings have proper dimensions and normalization
- **Error Simulation**: Tests error handling for invalid models
- **Performance Simulation**: Includes artificial delays for realistic testing

## Test Data

### Text Samples
- Basic phrases and sentences
- Long-form text
- Edge cases (empty strings, special characters)
- Multi-line text

### Similarity Test Pairs
- Semantically similar sentences
- Related concepts
- Unrelated content
- Identical text

## Coverage Goals

- **Unit Tests**: 100% coverage of configuration logic
- **Integration Tests**: Verify real-world model compatibility
- **Error Handling**: Test all failure scenarios
- **Performance**: Validate acceptable response times

## Known Limitations

1. **Network Dependency**: Integration tests require internet access for model downloads
2. **Model Availability**: IBM Granite model may not be publicly available
3. **Mock Limitations**: Mock embeddings don't reflect true semantic relationships
4. **Resource Requirements**: Large models require significant memory and processing time

## Adding New Models

To add support for a new embedding model:

1. **Update fixtures** (`tests/fixtures/embedding-models.ts`):
   ```typescript
   {
     name: 'new-model-name',
     modelId: 'organization/model-name',
     expectedDimension: 512,
     description: 'Description of the new model'
   }
   ```

2. **Add mock support** (`tests/__mocks__/@xenova/transformers.ts`):
   ```typescript
   'organization/model-name': {
     dimension: 512,
     generateEmbedding: (text: string) => {
       // Mock embedding generation logic
     }
   }
   ```

3. **Update tests**: Add specific test cases if needed

## Troubleshooting

### Common Issues

1. **Model Loading Failures**
   - Check internet connection for integration tests
   - Verify model ID is correct
   - Ensure sufficient disk space for model caching

2. **Test Timeouts**
   - Increase timeout in Jest configuration
   - Check system resources (RAM, CPU)
   - Consider running tests sequentially

3. **Mock Issues**
   - Verify mock is properly configured in Jest
   - Check module name mapping
   - Ensure mock implementation matches expected interface

### Debug Mode
```bash
# Run with verbose output
npm test -- --verbose

# Run specific test with debugging
npm test -- --testNamePattern="specific test name"
```

## Contributing

When adding new tests:
1. Follow existing naming conventions
2. Include both positive and negative test cases
3. Add appropriate documentation
4. Ensure tests are deterministic and fast
5. Mock external dependencies appropriately