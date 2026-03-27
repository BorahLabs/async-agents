import Database from 'better-sqlite3';
import { up as initialMigration } from './migrations/001_initial.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || './data/agents.sqlite';
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();
  initialMigration(database);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
