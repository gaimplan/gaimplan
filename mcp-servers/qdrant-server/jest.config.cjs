/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: false,
      tsconfig: {
        module: 'commonjs'
      }
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts' // Exclude main entry point from coverage
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for embedding model tests
  maxWorkers: 1, // Run tests sequentially to handle resource-intensive embedding tests
  
  // Handle ES modules in node_modules  
  transformIgnorePatterns: [
    'node_modules/(?!(@xenova/transformers|@qdrant/js-client-rest|onnxruntime-node)/)',
  ],
  
  // Mock external dependencies
  moduleNameMapper: {
    '^@xenova/transformers$': '<rootDir>/tests/__mocks__/@xenova/transformers.ts',
  },
  
};