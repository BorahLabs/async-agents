import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface TokenUsage {
  id: string;
  message_id: string;
  session_id: string;
  provider: string;
  model: string;
  raw_usage: string;
  created_at: string;
}

export interface RecordTokenUsageData {
  message_id: string;
  session_id: string;
  provider: string;
  model: string;
  raw_usage: string;
}

export interface TokenUsageStat {
  provider: string;
  date: string;
  total_input_tokens: number;
  total_output_tokens: number;
  request_count: number;
}

export function recordTokenUsage(data: RecordTokenUsageData): TokenUsage {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO token_usage (id, message_id, session_id, provider, model, raw_usage)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.message_id, data.session_id, data.provider, data.model, data.raw_usage);

  return db.prepare('SELECT * FROM token_usage WHERE id = ?').get(id) as TokenUsage;
}

export function getTokenUsageBySession(sessionId: string): TokenUsage[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM token_usage WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as TokenUsage[];
}

export function getTokenUsageByMessage(messageId: string): TokenUsage[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM token_usage WHERE message_id = ? ORDER BY created_at ASC')
    .all(messageId) as TokenUsage[];
}

export function getTokenUsageStats(period: 'day' | 'week' | 'month'): TokenUsageStat[] {
  const db = getDb();

  let dateFilter: string;
  switch (period) {
    case 'day':
      dateFilter = "datetime('now', '-1 day')";
      break;
    case 'week':
      dateFilter = "datetime('now', '-7 days')";
      break;
    case 'month':
      dateFilter = "datetime('now', '-1 month')";
      break;
  }

  return db
    .prepare(
      `SELECT
         provider,
         date(created_at) as date,
         SUM(COALESCE(json_extract(raw_usage, '$.input_tokens'), 0)) as total_input_tokens,
         SUM(COALESCE(json_extract(raw_usage, '$.output_tokens'), 0)) as total_output_tokens,
         COUNT(*) as request_count
       FROM token_usage
       WHERE created_at >= ${dateFilter}
       GROUP BY provider, date(created_at)
       ORDER BY date DESC, provider ASC`
    )
    .all() as TokenUsageStat[];
}
