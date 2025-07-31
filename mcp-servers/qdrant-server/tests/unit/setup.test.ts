/**
 * Basic test to verify Jest setup is working correctly
 */

describe('Test Setup', () => {
  test('Jest is configured correctly', () => {
    expect(true).toBe(true);
  });

  test('Global test utilities are available', () => {
    expect(global.testUtils).toBeDefined();
    expect(typeof global.testUtils.sleep).toBe('function');
    expect(typeof global.testUtils.randomString).toBe('function');
    expect(typeof global.testUtils.mockEmbedding).toBe('function');
  });

  test('Test utilities work correctly', () => {
    // Test randomString
    const str1 = global.testUtils.randomString();
    const str2 = global.testUtils.randomString();
    expect(str1).not.toBe(str2);
    expect(str1.length).toBe(8);

    // Test custom length
    const longStr = global.testUtils.randomString(12);
    expect(longStr.length).toBe(12);

    // Test mockEmbedding
    const embedding = global.testUtils.mockEmbedding();
    expect(embedding).toHaveLength(384);
    expect(embedding.every(val => typeof val === 'number')).toBe(true);

    // Test custom dimensions
    const customEmbedding = global.testUtils.mockEmbedding(256);
    expect(customEmbedding).toHaveLength(256);
  });
});