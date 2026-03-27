import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/index.js';
import { countSessions } from '../../db/queries/sessions.js';
import { getTokenUsageStats } from '../../db/queries/tokenUsage.js';
import type { QueueStats } from '../health.js';

export function createDashboardRouter(
  getQueueStats: () => QueueStats
): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const workers = getQueueStats();

      // Session stats
      const totalSessions = countSessions();
      const activeSessions = countSessions('active');
      const todayRow = db
        .prepare(
          `SELECT COUNT(*) as count FROM sessions
           WHERE created_at >= date('now')`
        )
        .get() as { count: number };

      // Recent completed/failed messages (last 10)
      const recentMessages = db
        .prepare(
          `SELECT * FROM messages
           WHERE status IN ('completed', 'failed')
           ORDER BY COALESCE(completed_at, failed_at) DESC
           LIMIT 10`
        )
        .all();

      // Token usage stats
      const tokenUsage = {
        day: getTokenUsageStats('day'),
        week: getTokenUsageStats('week'),
        month: getTokenUsageStats('month'),
      };

      res.json({
        workers,
        sessions: {
          total: totalSessions,
          active: activeSessions,
          todayCount: todayRow.count,
        },
        recentMessages,
        tokenUsage,
      });
    } catch (error) {
      console.error('[routes/admin/dashboard] GET / error:', error);
      res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
  });

  return router;
}
