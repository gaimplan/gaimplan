/**
 * Jest test setup file
 * Configures global test environment and utilities
 */

// Increase timeout for embedding model tests
jest.setTimeout(30000);

// Mock console methods to reduce noise during tests
const originalConsole = { ...console };

beforeEach(() => {
  // Restore console for individual tests that need it
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
});

// Global test utilities
global.testUtils = {
  /**
   * Wait for a specified amount of time
   */
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  /**
   * Generate a random test string
   */
  randomString: (length: number = 8) => {
    const str = Math.random().toString(36).substring(2);
    return str.length >= length ? str.substring(0, length) : str.padEnd(length, '0');
  },
  
  /**
   * Mock embedding vector for testing
   */
  mockEmbedding: (dimensions: number = 384) => {
    return Array.from({ length: dimensions }, () => Math.random() - 0.5);
  }
};

// Type declarations for global test utilities
declare global {
  var testUtils: {
    sleep: (ms: number) => Promise<void>;
    randomString: (length?: number) => string;
    mockEmbedding: (dimensions?: number) => number[];
  };
}

// This empty statement makes TypeScript treat this as a module without ES6 export syntax