import Database from 'better-sqlite3';
import { up as initialMigration } from './migrations/001_initial.js';
import { up as providerEnvVarsMigration } from './migrations/002_provider_env_vars.js';

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

function columnExists(database: Database.Database, table: string, column: string): boolean {
  const columns = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some((col) => col.name === column);
}

export function initDb(): void {
  const database = getDb();
  initialMigration(database);

  // 002: Add env_vars column to providers
  if (!columnExists(database, 'providers', 'env_vars')) {
    providerEnvVarsMigration(database);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
