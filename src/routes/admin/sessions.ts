import { Router } from 'express';
import type { Request, Response } from 'express';
import { listSessions, getSession, countSessions } from '../../db/queries/sessions.js';
import { getMessagesBySession, getMessage } from '../../db/queries/messages.js';
import { getToolCallsByMessage } from '../../db/queries/toolCalls.js';
import { getTokenUsageByMessage } from '../../db/queries/tokenUsage.js';

const router = Router();

// GET / - List sessions (read-only, no auth needed)
router.get('/', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const sessions = listSessions(page, limit);
    const total = countSessions();

    res.json({
      data: sessions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('[routes/admin/sessions] GET / error:', error);
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
    console.error('[routes/admin/sessions] GET /:id error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// GET /:id/messages - Get all messages for a session
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

    res.json({ messages: enriched });
  } catch (error) {
    console.error('[routes/admin/sessions] GET /:id/messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
