import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, getKeyPrefix } from '../../src/utils/crypto.js';

describe('generateApiKey', () => {
  it('returns a string starting with "sk_"', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^sk_/);
  });

  it('returns a key of the expected length (sk_ + 64 hex chars = 67)', () => {
    const key = generateApiKey();
    // "sk_" (3 chars) + 32 bytes as hex (64 chars) = 67
    expect(key.length).toBe(67);
  });

  it('returns unique values on successive calls', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();
    const key3 = generateApiKey();
    expect(key1).not.toBe(key2);
    expect(key2).not.toBe(key3);
    expect(key1).not.toBe(key3);
  });
});

describe('hashApiKey', () => {
  it('produces a consistent hash for the same input', () => {
    const key = 'sk_test1234567890';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it('produces a 64-character hex string (SHA-256)', () => {
    const hash = hashApiKey('some-key');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashApiKey('sk_key_one');
    const hash2 = hashApiKey('sk_key_two');
    expect(hash1).not.toBe(hash2);
  });
});

describe('getKeyPrefix', () => {
  it('returns the first 8 characters followed by "..."', () => {
    const prefix = getKeyPrefix('sk_abcdef1234567890');
    expect(prefix).toBe('sk_abcde...');
  });

  it('handles short strings gracefully', () => {
    const prefix = getKeyPrefix('abc');
    expect(prefix).toBe('abc...');
  });

  it('handles exactly 8-character strings', () => {
    const prefix = getKeyPrefix('12345678');
    expect(prefix).toBe('12345678...');
  });
});
