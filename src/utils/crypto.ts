import crypto from 'node:crypto';

/**
 * Generate a random API key prefixed with 'sk_'.
 * Returns sk_ + 32 random bytes encoded as hex (68 chars total).
 */
export function generateApiKey(): string {
  return `sk_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Hash an API key using SHA-256.
 * Returns the hex-encoded hash.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Get the prefix of an API key for display purposes.
 * Returns the first 8 characters followed by '...'.
 */
export function getKeyPrefix(key: string): string {
  return `${key.slice(0, 8)}...`;
}
