import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Set DB_PATH to a temp file BEFORE importing the db module
const tmpDbPath = path.join(os.tmpdir(), `async-agents-test-${crypto.randomUUID()}.sqlite`);
process.env.DB_PATH = tmpDbPath;

import { initDb, closeDb, getDb } from '../../src/db/index.js';
import { getSetting, setSetting } from '../../src/db/queries/settings.js';
import {
  createApiKey,
  listApiKeys,
  getApiKeyByHash,
  toggleApiKey,
  deleteApiKey,
} from '../../src/db/queries/apiKeys.js';
import {
  createProvider,
  listProviders,
  getProviderByName,
  updateProvider,
  deleteProvider,
} from '../../src/db/queries/providers.js';
import {
  createMcpServer,
  listMcpServers,
  getMcpServerByName,
  updateMcpServer,
  deleteMcpServer,
} from '../../src/db/queries/mcpServers.js';
import {
  createSkill,
  listSkills,
  getSkillByName,
  updateSkill,
  deleteSkill,
} from '../../src/db/queries/skills.js';
import {
  createSession,
  listSessions,
  getSessionsWithMessageCount,
} from '../../src/db/queries/sessions.js';
import {
  createMessage,
  getNextQueuedMessage,
  updateMessageStatus,
  requeueMessage,
  countQueuedMessages,
} from '../../src/db/queries/messages.js';
import {
  recordTokenUsage,
  getTokenUsageBySession,
} from '../../src/db/queries/tokenUsage.js';
import {
  recordToolCall,
  getToolCallsByMessage,
} from '../../src/db/queries/toolCalls.js';

beforeAll(() => {
  initDb();
});

afterAll(() => {
  closeDb();
  // Clean up temp file
  try {
    fs.unlinkSync(tmpDbPath);
    fs.unlinkSync(tmpDbPath + '-wal');
    fs.unlinkSync(tmpDbPath + '-shm');
  } catch {
    // ignore if files don't exist
  }
});

/**
 * Helper: clear all rows from all tables between tests to ensure isolation.
 * Order matters due to foreign keys.
 */
function clearTables() {
  const db = getDb();
  db.exec('DELETE FROM tool_calls');
  db.exec('DELETE FROM token_usage');
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM api_keys');
  db.exec('DELETE FROM providers');
  db.exec('DELETE FROM mcp_servers');
  db.exec('DELETE FROM skills');
  db.exec("DELETE FROM settings WHERE key NOT IN ('max_concurrent_workers', 'github_token')");
}

// ─── Settings ──────────────────────────────────────────────────────
describe('settings queries', () => {
  beforeEach(() => clearTables());

  it('returns null for a non-existent key', () => {
    expect(getSetting('nonexistent_key')).toBeNull();
  });

  it('sets and gets a value', () => {
    setSetting('test_key', 'hello');
    expect(getSetting('test_key')).toBe('hello');
  });

  it('updates an existing value via upsert', () => {
    setSetting('test_key', 'first');
    expect(getSetting('test_key')).toBe('first');

    setSetting('test_key', 'second');
    expect(getSetting('test_key')).toBe('second');
  });

  it('reads default settings from migration', () => {
    // The migration inserts max_concurrent_workers = '2'
    expect(getSetting('max_concurrent_workers')).toBe('2');
  });
});

// ─── API Keys ──────────────────────────────────────────────────────
describe('apiKeys queries', () => {
  beforeEach(() => clearTables());

  it('creates an API key with sk_ prefix', () => {
    const result = createApiKey('test label');
    expect(result.key).toMatch(/^sk_/);
    expect(result.id).toBeTruthy();
    expect(result.keyPrefix).toBe(result.key.slice(0, 8));
  });

  it('lists created API keys', () => {
    createApiKey('key1');
    createApiKey('key2');
    const keys = listApiKeys();
    expect(keys.length).toBe(2);
  });

  it('round-trips an API key via hash lookup', () => {
    const { key } = createApiKey('round-trip test');
    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const found = getApiKeyByHash(hash);
    expect(found).toBeDefined();
    expect(found!.label).toBe('round-trip test');
  });

  it('toggles an API key active/inactive', () => {
    const { id } = createApiKey('toggle test');
    let keys = listApiKeys();
    let keyRow = keys.find((k) => k.id === id)!;
    expect(keyRow.active).toBe(1);

    toggleApiKey(id, false);
    keys = listApiKeys();
    keyRow = keys.find((k) => k.id === id)!;
    expect(keyRow.active).toBe(0);

    toggleApiKey(id, true);
    keys = listApiKeys();
    keyRow = keys.find((k) => k.id === id)!;
    expect(keyRow.active).toBe(1);
  });

  it('deletes an API key', () => {
    const { id } = createApiKey('delete test');
    expect(listApiKeys().length).toBe(1);

    deleteApiKey(id);
    expect(listApiKeys().length).toBe(0);
  });
});

// ─── Providers ─────────────────────────────────────────────────────
describe('providers queries', () => {
  beforeEach(() => clearTables());

  it('creates and retrieves a provider', () => {
    const provider = createProvider({
      name: 'openai',
      type: 'openai',
      api_key: 'sk-test-key',
    });
    expect(provider.id).toBeTruthy();
    expect(provider.name).toBe('openai');
    expect(provider.type).toBe('openai');
    expect(provider.api_key).toBe('sk-test-key');
  });

  it('lists providers', () => {
    createProvider({ name: 'p1', type: 'openai', api_key: 'k1' });
    createProvider({ name: 'p2', type: 'anthropic', api_key: 'k2' });
    expect(listProviders().length).toBe(2);
  });

  it('finds a provider by name', () => {
    createProvider({ name: 'unique-name', type: 'openai', api_key: 'k' });
    const found = getProviderByName('unique-name');
    expect(found).toBeDefined();
    expect(found!.name).toBe('unique-name');
  });

  it('updates a provider', () => {
    const provider = createProvider({ name: 'to-update', type: 'openai', api_key: 'old' });
    const updated = updateProvider(provider.id, { api_key: 'new-key', base_url: 'http://example.com' });
    expect(updated).toBeDefined();
    expect(updated!.api_key).toBe('new-key');
    expect(updated!.base_url).toBe('http://example.com');
  });

  it('deletes a provider', () => {
    const provider = createProvider({ name: 'to-delete', type: 'openai', api_key: 'k' });
    deleteProvider(provider.id);
    expect(listProviders().length).toBe(0);
  });
});

// ─── MCP Servers ───────────────────────────────────────────────────
describe('mcpServers queries', () => {
  beforeEach(() => clearTables());

  it('creates and retrieves an MCP server', () => {
    const server = createMcpServer({
      name: 'test-server',
      type: 'stdio',
      command: 'npx -y @test/server',
    });
    expect(server.id).toBeTruthy();
    expect(server.name).toBe('test-server');
    expect(server.type).toBe('stdio');
    expect(server.command).toBe('npx -y @test/server');
  });

  it('lists MCP servers', () => {
    createMcpServer({ name: 's1', type: 'stdio', command: 'cmd1' });
    createMcpServer({ name: 's2', type: 'sse', url: 'http://localhost:3000' });
    expect(listMcpServers().length).toBe(2);
  });

  it('finds an MCP server by name', () => {
    createMcpServer({ name: 'find-me', type: 'stdio', command: 'cmd' });
    const found = getMcpServerByName('find-me');
    expect(found).toBeDefined();
    expect(found!.name).toBe('find-me');
  });

  it('updates an MCP server', () => {
    const server = createMcpServer({ name: 'to-update', type: 'stdio', command: 'old' });
    const updated = updateMcpServer(server.id, { command: 'new-cmd', description: 'updated' });
    expect(updated).toBeDefined();
    expect(updated!.command).toBe('new-cmd');
    expect(updated!.description).toBe('updated');
  });

  it('deletes an MCP server', () => {
    const server = createMcpServer({ name: 'to-delete', type: 'stdio', command: 'cmd' });
    deleteMcpServer(server.id);
    expect(listMcpServers().length).toBe(0);
  });
});

// ─── Skills ────────────────────────────────────────────────────────
describe('skills queries', () => {
  beforeEach(() => clearTables());

  it('creates and retrieves a skill', () => {
    const skill = createSkill({
      name: 'code-review',
      system_prompt: 'You are a code reviewer.',
      allowed_tools: '["read_file","write_file"]',
    });
    expect(skill.id).toBeTruthy();
    expect(skill.name).toBe('code-review');
    expect(skill.system_prompt).toBe('You are a code reviewer.');
    expect(skill.allowed_tools).toBe('["read_file","write_file"]');
  });

  it('lists skills', () => {
    createSkill({ name: 'sk1', system_prompt: 'p1' });
    createSkill({ name: 'sk2', system_prompt: 'p2' });
    expect(listSkills().length).toBe(2);
  });

  it('finds a skill by name', () => {
    createSkill({ name: 'find-me', system_prompt: 'prompt' });
    const found = getSkillByName('find-me');
    expect(found).toBeDefined();
    expect(found!.name).toBe('find-me');
  });

  it('updates a skill', () => {
    const skill = createSkill({ name: 'to-update', system_prompt: 'old' });
    const updated = updateSkill(skill.id, {
      system_prompt: 'new prompt',
      model_provider: 'anthropic',
      model_id: 'claude-4',
    });
    expect(updated).toBeDefined();
    expect(updated!.system_prompt).toBe('new prompt');
    expect(updated!.model_provider).toBe('anthropic');
    expect(updated!.model_id).toBe('claude-4');
  });

  it('deletes a skill', () => {
    const skill = createSkill({ name: 'to-delete', system_prompt: 'p' });
    deleteSkill(skill.id);
    expect(listSkills().length).toBe(0);
  });
});

// ─── Sessions ──────────────────────────────────────────────────────
describe('sessions queries', () => {
  beforeEach(() => clearTables());

  it('creates a session with ses_ prefix', () => {
    const session = createSession({ provider: 'openai', model: 'gpt-4o' });
    expect(session.id).toMatch(/^ses_/);
    expect(session.status).toBe('active');
    expect(session.provider).toBe('openai');
    expect(session.model).toBe('gpt-4o');
  });

  it('lists sessions with pagination', () => {
    for (let i = 0; i < 5; i++) {
      createSession({ provider: 'openai', model: 'gpt-4o', title: `session-${i}` });
    }

    const page1 = listSessions(1, 3);
    expect(page1.length).toBe(3);

    const page2 = listSessions(2, 3);
    expect(page2.length).toBe(2);
  });

  it('lists sessions filtered by status', () => {
    createSession({ provider: 'openai', model: 'gpt-4o' });
    const session2 = createSession({ provider: 'openai', model: 'gpt-4o' });
    // Update one session to 'archived'
    const db = getDb();
    db.prepare("UPDATE sessions SET status = 'archived' WHERE id = ?").run(session2.id);

    const active = listSessions(1, 20, 'active');
    expect(active.length).toBe(1);

    const archived = listSessions(1, 20, 'archived');
    expect(archived.length).toBe(1);
  });

  it('getSessionsWithMessageCount returns message counts', () => {
    const session = createSession({ provider: 'openai', model: 'gpt-4o' });
    createMessage({ session_id: session.id, role: 'user', content: 'hello' });
    createMessage({ session_id: session.id, role: 'user', content: 'world' });

    const results = getSessionsWithMessageCount();
    expect(results.length).toBe(1);
    expect(results[0].message_count).toBe(2);
  });
});

// ─── Messages ──────────────────────────────────────────────────────
describe('messages queries', () => {
  let sessionId: string;

  beforeEach(() => {
    clearTables();
    const session = createSession({ provider: 'openai', model: 'gpt-4o' });
    sessionId = session.id;
  });

  it('creates a message with msg_ prefix', () => {
    const msg = createMessage({ session_id: sessionId, role: 'user', content: 'hello' });
    expect(msg.id).toMatch(/^msg_/);
    expect(msg.session_id).toBe(sessionId);
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
    expect(msg.status).toBe('queued');
    expect(msg.position).toBe(0);
  });

  it('auto-increments position within a session', () => {
    const msg1 = createMessage({ session_id: sessionId, role: 'user', content: 'first' });
    const msg2 = createMessage({ session_id: sessionId, role: 'user', content: 'second' });
    expect(msg1.position).toBe(0);
    expect(msg2.position).toBe(1);
  });

  it('getNextQueuedMessage returns the oldest queued message (FIFO)', () => {
    createMessage({ session_id: sessionId, role: 'user', content: 'first' });

    // Create a second session with a message
    const session2 = createSession({ provider: 'openai', model: 'gpt-4o' });
    createMessage({ session_id: session2.id, role: 'user', content: 'second' });

    const next = getNextQueuedMessage();
    expect(next).toBeDefined();
    expect(next!.content).toBe('first');
  });

  it('getNextQueuedMessage skips sessions that have a processing message', () => {
    // Session 1: has a processing message
    const msg1 = createMessage({ session_id: sessionId, role: 'user', content: 'sess1-msg1' });
    updateMessageStatus(msg1.id, 'processing');
    createMessage({ session_id: sessionId, role: 'user', content: 'sess1-msg2' });

    // Session 2: only queued messages
    const session2 = createSession({ provider: 'openai', model: 'gpt-4o' });
    createMessage({ session_id: session2.id, role: 'user', content: 'sess2-msg1' });

    const next = getNextQueuedMessage();
    expect(next).toBeDefined();
    expect(next!.content).toBe('sess2-msg1');
  });

  it('updateMessageStatus transitions to processing with started_at', () => {
    const msg = createMessage({ session_id: sessionId, role: 'user', content: 'hello' });
    updateMessageStatus(msg.id, 'processing');

    const db = getDb();
    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as any;
    expect(updated.status).toBe('processing');
    expect(updated.started_at).not.toBeNull();
  });

  it('updateMessageStatus transitions to completed with completed_at', () => {
    const msg = createMessage({ session_id: sessionId, role: 'user', content: 'hello' });
    updateMessageStatus(msg.id, 'completed', { content: 'response' });

    const db = getDb();
    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as any;
    expect(updated.status).toBe('completed');
    expect(updated.completed_at).not.toBeNull();
    expect(updated.content).toBe('response');
  });

  it('requeueMessage resets status to queued', () => {
    const msg = createMessage({ session_id: sessionId, role: 'user', content: 'hello' });
    updateMessageStatus(msg.id, 'processing');
    requeueMessage(msg.id);

    const db = getDb();
    const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id) as any;
    expect(updated.status).toBe('queued');
    expect(updated.started_at).toBeNull();
    expect(updated.error).toBeNull();
  });

  it('countQueuedMessages returns the correct count', () => {
    createMessage({ session_id: sessionId, role: 'user', content: 'a' });
    createMessage({ session_id: sessionId, role: 'user', content: 'b' });

    expect(countQueuedMessages()).toBe(2);

    const msg3 = createMessage({ session_id: sessionId, role: 'user', content: 'c' });
    updateMessageStatus(msg3.id, 'completed');

    expect(countQueuedMessages()).toBe(2);
  });
});

// ─── Token Usage ───────────────────────────────────────────────────
describe('tokenUsage queries', () => {
  let sessionId: string;
  let messageId: string;

  beforeEach(() => {
    clearTables();
    const session = createSession({ provider: 'openai', model: 'gpt-4o' });
    sessionId = session.id;
    const msg = createMessage({ session_id: sessionId, role: 'user', content: 'hello' });
    messageId = msg.id;
  });

  it('records and retrieves token usage', () => {
    const usage = recordTokenUsage({
      message_id: messageId,
      session_id: sessionId,
      provider: 'openai',
      model: 'gpt-4o',
      raw_usage: JSON.stringify({ input_tokens: 100, output_tokens: 50 }),
    });
    expect(usage.id).toBeTruthy();
    expect(usage.provider).toBe('openai');
  });

  it('getTokenUsageBySession returns all usage for a session', () => {
    recordTokenUsage({
      message_id: messageId,
      session_id: sessionId,
      provider: 'openai',
      model: 'gpt-4o',
      raw_usage: JSON.stringify({ input_tokens: 100, output_tokens: 50 }),
    });

    const msg2 = createMessage({ session_id: sessionId, role: 'assistant', content: 'reply' });
    recordTokenUsage({
      message_id: msg2.id,
      session_id: sessionId,
      provider: 'openai',
      model: 'gpt-4o',
      raw_usage: JSON.stringify({ input_tokens: 200, output_tokens: 100 }),
    });

    const usages = getTokenUsageBySession(sessionId);
    expect(usages.length).toBe(2);
  });
});

// ─── Tool Calls ────────────────────────────────────────────────────
describe('toolCalls queries', () => {
  let sessionId: string;
  let messageId: string;

  beforeEach(() => {
    clearTables();
    const session = createSession({ provider: 'openai', model: 'gpt-4o' });
    sessionId = session.id;
    const msg = createMessage({ session_id: sessionId, role: 'assistant', content: 'response' });
    messageId = msg.id;
  });

  it('records and retrieves a tool call', () => {
    const tc = recordToolCall({
      message_id: messageId,
      tool_name: 'read_file',
      input: JSON.stringify({ path: '/tmp/test.txt' }),
      output: 'file contents',
      duration_ms: 42,
    });
    expect(tc.id).toBeTruthy();
    expect(tc.tool_name).toBe('read_file');
    expect(tc.duration_ms).toBe(42);
  });

  it('getToolCallsByMessage returns all tool calls for a message', () => {
    recordToolCall({ message_id: messageId, tool_name: 'read_file' });
    recordToolCall({ message_id: messageId, tool_name: 'write_file' });
    recordToolCall({ message_id: messageId, tool_name: 'bash' });

    const calls = getToolCallsByMessage(messageId);
    expect(calls.length).toBe(3);
    expect(calls.map((c) => c.tool_name)).toEqual(['read_file', 'write_file', 'bash']);
  });
});
