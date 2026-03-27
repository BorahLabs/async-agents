import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface Provider {
  id: string;
  name: string;
  type: string;
  base_url: string | null;
  api_key: string;
  models: string | null;
  env_vars: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProviderData {
  name: string;
  type: string;
  base_url?: string | null;
  api_key: string;
  models?: string | null;
  env_vars?: string | null;
}

export interface UpdateProviderData {
  name?: string;
  type?: string;
  base_url?: string | null;
  api_key?: string;
  models?: string | null;
  env_vars?: string | null;
}

export function createProvider(data: CreateProviderData): Provider {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO providers (id, name, type, base_url, api_key, models, env_vars)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.type, data.base_url ?? null, data.api_key, data.models ?? null, data.env_vars ?? null);

  return getProvider(id)!;
}

export function listProviders(): Provider[] {
  const db = getDb();
  return db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all() as Provider[];
}

export function getProvider(id: string): Provider | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined;
}

export function getProviderByName(name: string): Provider | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM providers WHERE name = ?').get(name) as Provider | undefined;
}

export function updateProvider(id: string, data: UpdateProviderData): Provider | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.base_url !== undefined) {
    fields.push('base_url = ?');
    values.push(data.base_url);
  }
  if (data.api_key !== undefined) {
    fields.push('api_key = ?');
    values.push(data.api_key);
  }
  if (data.models !== undefined) {
    fields.push('models = ?');
    values.push(data.models);
  }
  if (data.env_vars !== undefined) {
    fields.push('env_vars = ?');
    values.push(data.env_vars);
  }

  if (fields.length === 0) return getProvider(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProvider(id);
}

export function deleteProvider(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
}
