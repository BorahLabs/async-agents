import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface ToolCall {
  id: string;
  message_id: string;
  tool_name: string;
  input: string | null;
  output: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface RecordToolCallData {
  message_id: string;
  tool_name: string;
  input?: string | null;
  output?: string | null;
  duration_ms?: number | null;
}

export function recordToolCall(data: RecordToolCallData): ToolCall {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO tool_calls (id, message_id, tool_name, input, output, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.message_id,
    data.tool_name,
    data.input ?? null,
    data.output ?? null,
    data.duration_ms ?? null
  );

  return db.prepare('SELECT * FROM tool_calls WHERE id = ?').get(id) as ToolCall;
}

export function getToolCallsByMessage(messageId: string): ToolCall[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC')
    .all(messageId) as ToolCall[];
}
