import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface Session {
  id: string;
  title: string | null;
  status: string;
  provider: string;
  model: string;
  system_prompt: string | null;
  working_directory: string | null;
  mcp_servers: string | null;
  skills: string | null;
  opencode_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionWithMessageCount extends Session {
  message_count: number;
}

export interface CreateSessionData {
  title?: string | null;
  provider: string;
  model: string;
  system_prompt?: string | null;
  working_directory?: string | null;
  mcp_servers?: string | null;
  skills?: string | null;
}

export interface UpdateSessionData {
  title?: string | null;
  status?: string;
  provider?: string;
  model?: string;
  system_prompt?: string | null;
  working_directory?: string | null;
  mcp_servers?: string | null;
  skills?: string | null;
  opencode_session_id?: string | null;
}

export function createSession(data: CreateSessionData): Session {
  const db = getDb();
  const id = `ses_${uuidv4()}`;
  db.prepare(
    `INSERT INTO sessions (id, title, provider, model, system_prompt, working_directory, mcp_servers, skills)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.title ?? null,
    data.provider,
    data.model,
    data.system_prompt ?? null,
    data.working_directory ?? null,
    data.mcp_servers ?? null,
    data.skills ?? null
  );

  return getSession(id)!;
}

export function listSessions(
  page: number = 1,
  limit: number = 20,
  status?: string
): Session[] {
  const db = getDb();
  const offset = (page - 1) * limit;

  if (status) {
    return db
      .prepare('SELECT * FROM sessions WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(status, limit, offset) as Session[];
  }

  return db
    .prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Session[];
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function updateSession(id: string, data: UpdateSessionData): Session | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    values.push(data.status);
  }
  if (data.provider !== undefined) {
    fields.push('provider = ?');
    values.push(data.provider);
  }
  if (data.model !== undefined) {
    fields.push('model = ?');
    values.push(data.model);
  }
  if (data.system_prompt !== undefined) {
    fields.push('system_prompt = ?');
    values.push(data.system_prompt);
  }
  if (data.working_directory !== undefined) {
    fields.push('working_directory = ?');
    values.push(data.working_directory);
  }
  if (data.mcp_servers !== undefined) {
    fields.push('mcp_servers = ?');
    values.push(data.mcp_servers);
  }
  if (data.skills !== undefined) {
    fields.push('skills = ?');
    values.push(data.skills);
  }
  if (data.opencode_session_id !== undefined) {
    fields.push('opencode_session_id = ?');
    values.push(data.opencode_session_id);
  }

  if (fields.length === 0) return getSession(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSession(id);
}

export function countSessions(status?: string): number {
  const db = getDb();
  if (status) {
    const row = db.prepare('SELECT COUNT(*) as count FROM sessions WHERE status = ?').get(status) as {
      count: number;
    };
    return row.count;
  }
  const row = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number };
  return row.count;
}

export function getSessionsWithMessageCount(
  page: number = 1,
  limit: number = 20,
  status?: string
): SessionWithMessageCount[] {
  const db = getDb();
  const offset = (page - 1) * limit;

  if (status) {
    return db
      .prepare(
        `SELECT s.*, COUNT(m.id) as message_count
         FROM sessions s
         LEFT JOIN messages m ON m.session_id = s.id
         WHERE s.status = ?
         GROUP BY s.id
         ORDER BY s.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(status, limit, offset) as SessionWithMessageCount[];
  }

  return db
    .prepare(
      `SELECT s.*, COUNT(m.id) as message_count
       FROM sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as SessionWithMessageCount[];
}
