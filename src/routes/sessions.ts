import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import {
  createSession,
  getSession,
  listSessions,
  countSessions,
} from '../db/queries/sessions.js';
import {
  createMessage,
  getMessage,
  getMessagesBySession,
} from '../db/queries/messages.js';
import { getProviderByName } from '../db/queries/providers.js';
import { getMcpServerByName } from '../db/queries/mcpServers.js';
import { getSkillByName } from '../db/queries/skills.js';
import { getToolCallsByMessage } from '../db/queries/toolCalls.js';
import { getTokenUsageByMessage } from '../db/queries/tokenUsage.js';
import {
  validateFolderName,
  getFolderPath,
} from '../utils/validation.js';

const router = Router();

// POST / - Create session
router.post('/', (req: Request, res: Response) => {
  try {
    const { provider, model, title, system_prompt, working_directory, mcp_servers, skills } =
      req.body;

    // Validate required fields
    if (!provider || !model) {
      res.status(400).json({ error: 'provider and model are required' });
      return;
    }

    // Check provider exists
    const providerRecord = getProviderByName(provider);
    if (!providerRecord) {
      res.status(400).json({ error: `Provider "${provider}" not found` });
      return;
    }

    // Validate MCP servers if provided
    if (mcp_servers) {
      const serverNames: string[] = Array.isArray(mcp_servers)
        ? mcp_servers
        : JSON.parse(mcp_servers);
      for (const name of serverNames) {
        const server = getMcpServerByName(name);
        if (!server) {
          res.status(400).json({ error: `MCP server "${name}" not found` });
          return;
        }
      }
    }

    // Validate skills if provided
    if (skills) {
      const skillNames: string[] = Array.isArray(skills)
        ? skills
        : JSON.parse(skills);
      for (const name of skillNames) {
        const skill = getSkillByName(name);
        if (!skill) {
          res.status(400).json({ error: `Skill "${name}" not found` });
          return;
        }
      }
    }

    // Validate and create working directory if provided
    if (working_directory) {
      const validation = validateFolderName(working_directory);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      const folderPath = getFolderPath(working_directory);
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Create session
    const session = createSession({
      title: title ?? null,
      provider,
      model,
      system_prompt: system_prompt ?? null,
      working_directory: working_directory ?? null,
      mcp_servers: mcp_servers
        ? typeof mcp_servers === 'string'
          ? mcp_servers
          : JSON.stringify(mcp_servers)
        : null,
      skills: skills
        ? typeof skills === 'string'
          ? skills
          : JSON.stringify(skills)
        : null,
    });

    res.status(201).json({
      id: session.id,
      status: session.status,
      createdAt: session.created_at,
    });
  } catch (error) {
    console.error('[routes/sessions] POST / error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET / - List sessions with pagination
router.get('/', (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const status = req.query.status as string | undefined;

    const sessions = listSessions(page, limit, status);
    const total = countSessions(status);

    res.json({
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[routes/sessions] GET / error:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// GET /:id - Get session details
router.get('/:id', (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (error) {
    console.error('[routes/sessions] GET /:id error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// GET /:id/messages - Get all messages for session with tool calls and token usage
router.get('/:id/messages', (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const messages = getMessagesBySession(session.id);
    const enriched = messages.map((msg) => ({
      ...msg,
      tool_calls: getToolCallsByMessage(msg.id),
      token_usage: getTokenUsageByMessage(msg.id),
    }));

    res.json(enriched);
  } catch (error) {
    console.error('[routes/sessions] GET /:id/messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// POST /:id/messages - Send message (queued)
router.post('/:id/messages', (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const { text, structuredOutput } = req.body;
    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const message = createMessage({
      session_id: session.id,
      role: 'user',
      content: text,
      structured_output_schema: structuredOutput
        ? typeof structuredOutput === 'string'
          ? structuredOutput
          : JSON.stringify(structuredOutput)
        : null,
    });

    res.status(201).json({
      id: message.id,
      status: message.status,
      position: message.position,
      queuedAt: message.queued_at,
    });
  } catch (error) {
    console.error('[routes/sessions] POST /:id/messages error:', error);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

// GET /:id/messages/:msgId - Get specific message with tool calls and token usage
router.get('/:id/messages/:msgId', (req: Request, res: Response) => {
  try {
    const session = getSession(req.params.id as string);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const message = getMessage(req.params.msgId as string);
    if (!message || message.session_id !== session.id) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    res.json({
      ...message,
      tool_calls: getToolCallsByMessage(message.id),
      token_usage: getTokenUsageByMessage(message.id),
    });
  } catch (error) {
    console.error('[routes/sessions] GET /:id/messages/:msgId error:', error);
    res.status(500).json({ error: 'Failed to get message' });
  }
});

export default router;
