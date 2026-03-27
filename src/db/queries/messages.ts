import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  structured_output_schema: string | null;
  structured_output_result: string | null;
  error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  position: number;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
}

export interface CreateMessageData {
  session_id: string;
  role: 'user' | 'assistant';
  content?: string | null;
  structured_output_schema?: string | null;
}

export interface UpdateMessageStatusExtra {
  content?: string | null;
  error?: string | null;
  structured_output_result?: string | null;
  retry_count?: number;
  next_retry_at?: string | null;
}

export function createMessage(data: CreateMessageData): Message {
  const db = getDb();
  const id = `msg_${uuidv4()}`;
  const position = getMessagePosition(data.session_id);

  db.prepare(
    `INSERT INTO messages (id, session_id, role, content, position, structured_output_schema)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.session_id,
    data.role,
    data.content ?? null,
    position,
    data.structured_output_schema ?? null
  );

  return getMessage(id)!;
}

export function getMessage(id: string): Message | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as Message | undefined;
}

export function getMessagesBySession(sessionId: string): Message[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY position ASC')
    .all(sessionId) as Message[];
}

export function updateMessageStatus(
  id: string,
  status: Message['status'],
  extra?: UpdateMessageStatusExtra
): void {
  const db = getDb();
  const fields: string[] = ['status = ?'];
  const values: unknown[] = [status];

  if (status === 'processing') {
    fields.push("started_at = datetime('now')");
  } else if (status === 'completed') {
    fields.push("completed_at = datetime('now')");
  } else if (status === 'failed') {
    fields.push("failed_at = datetime('now')");
  }

  if (extra?.content !== undefined) {
    fields.push('content = ?');
    values.push(extra.content);
  }
  if (extra?.error !== undefined) {
    fields.push('error = ?');
    values.push(extra.error);
  }
  if (extra?.structured_output_result !== undefined) {
    fields.push('structured_output_result = ?');
    values.push(extra.structured_output_result);
  }
  if (extra?.retry_count !== undefined) {
    fields.push('retry_count = ?');
    values.push(extra.retry_count);
  }
  if (extra?.next_retry_at !== undefined) {
    fields.push('next_retry_at = ?');
    values.push(extra.next_retry_at);
  }

  values.push(id);
  db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getNextQueuedMessage(): Message | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE status = 'queued'
         AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
         AND session_id NOT IN (
           SELECT DISTINCT session_id FROM messages WHERE status = 'processing'
         )
       ORDER BY queued_at ASC
       LIMIT 1`
    )
    .get() as Message | undefined;
}

export function getProcessingMessages(): Message[] {
  const db = getDb();
  return db.prepare("SELECT * FROM messages WHERE status = 'processing'").all() as Message[];
}

export function requeueMessage(id: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE messages
     SET status = 'queued', started_at = NULL, error = NULL
     WHERE id = ?`
  ).run(id);
}

export function getMessagePosition(sessionId: string): number {
  const db = getDb();
  const row = db
    .prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM messages WHERE session_id = ?')
    .get(sessionId) as { max_pos: number };
  return row.max_pos + 1;
}

export function countQueuedMessages(): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM messages WHERE status = 'queued'").get() as {
    count: number;
  };
  return row.count;
}
