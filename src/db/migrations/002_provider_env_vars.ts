import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`ALTER TABLE providers ADD COLUMN env_vars TEXT`);
}
