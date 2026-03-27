import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface McpServer {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  command: string | null;
  url: string | null;
  env_vars: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMcpServerData {
  name: string;
  type: 'stdio' | 'sse';
  command?: string | null;
  url?: string | null;
  env_vars?: string | null;
  description?: string | null;
}

export interface UpdateMcpServerData {
  name?: string;
  type?: 'stdio' | 'sse';
  command?: string | null;
  url?: string | null;
  env_vars?: string | null;
  description?: string | null;
}

export function createMcpServer(data: CreateMcpServerData): McpServer {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO mcp_servers (id, name, type, command, url, env_vars, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.type,
    data.command ?? null,
    data.url ?? null,
    data.env_vars ?? null,
    data.description ?? null
  );

  return getMcpServer(id)!;
}

export function listMcpServers(): McpServer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as McpServer[];
}

export function getMcpServer(id: string): McpServer | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as McpServer | undefined;
}

export function getMcpServerByName(name: string): McpServer | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM mcp_servers WHERE name = ?').get(name) as McpServer | undefined;
}

export function updateMcpServer(id: string, data: UpdateMcpServerData): McpServer | undefined {
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
  if (data.command !== undefined) {
    fields.push('command = ?');
    values.push(data.command);
  }
  if (data.url !== undefined) {
    fields.push('url = ?');
    values.push(data.url);
  }
  if (data.env_vars !== undefined) {
    fields.push('env_vars = ?');
    values.push(data.env_vars);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }

  if (fields.length === 0) return getMcpServer(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getMcpServer(id);
}

export function deleteMcpServer(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}
