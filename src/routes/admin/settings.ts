import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/index.js';
import { setSetting } from '../../db/queries/settings.js';
import type { Setting } from '../../db/queries/settings.js';

const router = Router();

// GET / - Get all settings
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM settings ORDER BY key ASC').all() as Setting[];

    const settings: Record<string, string | null> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json(settings);
  } catch (error) {
    console.error('[routes/admin/settings] GET / error:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT / - Update settings (body is key-value pairs)
router.put('/', (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, string>;

    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Body must be an object of key-value pairs' });
      return;
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        res.status(400).json({ error: `Invalid setting: key and value must be strings (key: "${key}")` });
        return;
      }
      setSetting(key, value);
    }

    // Return updated settings
    const db = getDb();
    const rows = db.prepare('SELECT * FROM settings ORDER BY key ASC').all() as Setting[];

    const settings: Record<string, string | null> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    res.json(settings);
  } catch (error) {
    console.error('[routes/admin/settings] PUT / error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
