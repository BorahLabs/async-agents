import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../index.js';

export interface Skill {
  id: string;
  name: string;
  system_prompt: string;
  allowed_tools: string | null;
  model_provider: string | null;
  model_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSkillData {
  name: string;
  system_prompt: string;
  allowed_tools?: string | null;
  model_provider?: string | null;
  model_id?: string | null;
  description?: string | null;
}

export interface UpdateSkillData {
  name?: string;
  system_prompt?: string;
  allowed_tools?: string | null;
  model_provider?: string | null;
  model_id?: string | null;
  description?: string | null;
}

export function createSkill(data: CreateSkillData): Skill {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO skills (id, name, system_prompt, allowed_tools, model_provider, model_id, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.system_prompt,
    data.allowed_tools ?? null,
    data.model_provider ?? null,
    data.model_id ?? null,
    data.description ?? null
  );

  return getSkill(id)!;
}

export function listSkills(): Skill[] {
  const db = getDb();
  return db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all() as Skill[];
}

export function getSkill(id: string): Skill | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined;
}

export function getSkillByName(name: string): Skill | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as Skill | undefined;
}

export function updateSkill(id: string, data: UpdateSkillData): Skill | undefined {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name !== undefined) {
    fields.push('name = ?');
    values.push(data.name);
  }
  if (data.system_prompt !== undefined) {
    fields.push('system_prompt = ?');
    values.push(data.system_prompt);
  }
  if (data.allowed_tools !== undefined) {
    fields.push('allowed_tools = ?');
    values.push(data.allowed_tools);
  }
  if (data.model_provider !== undefined) {
    fields.push('model_provider = ?');
    values.push(data.model_provider);
  }
  if (data.model_id !== undefined) {
    fields.push('model_id = ?');
    values.push(data.model_id);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    values.push(data.description);
  }

  if (fields.length === 0) return getSkill(id);

  fields.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSkill(id);
}

export function deleteSkill(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
}
