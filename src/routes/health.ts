import { Router } from 'express';

export interface QueueStats {
  active: number;
  max: number;
  queueLength: number;
}

export function createHealthRouter(
  getQueueStats: () => QueueStats
): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      const workers = getQueueStats();
      res.json({
        status: 'ok',
        workers,
        uptime: process.uptime(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve health status' });
    }
  });

  return router;
}
