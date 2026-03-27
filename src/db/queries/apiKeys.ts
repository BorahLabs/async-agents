import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface ApiKey {
  id: string;
  label: string;
  key_hash: string;
  key_prefix: string;
  active: number;
  last_used_at: string | null;
  created_at: string;
}

export interface CreateApiKeyResult {
  id: string;
  key: string;
  keyPrefix: string;
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function createApiKey(label: string): CreateApiKeyResult {
  const db = getDb();
  const id = uuidv4();
  const rawKey = crypto.randomBytes(32).toString('hex');
  const key = `sk_${rawKey}`;
  const keyPrefix = key.slice(0, 8);
  const keyHash = hashKey(key);

  db.prepare(
    'INSERT INTO api_keys (id, label, key_hash, key_prefix) VALUES (?, ?, ?, ?)'
  ).run(id, label, keyHash, keyPrefix);

  return { id, key, keyPrefix };
}

export function listApiKeys(): ApiKey[] {
  const db = getDb();
  return db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as ApiKey[];
}

export function getApiKeyByHash(hash: string): ApiKey | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash) as ApiKey | undefined;
}

export function toggleApiKey(id: string, active: boolean): void {
  const db = getDb();
  db.prepare('UPDATE api_keys SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function deleteApiKey(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
}

export function updateLastUsed(id: string): void {
  const db = getDb();
  db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
}
