import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listApiKeys,
  createApiKey,
  toggleApiKey,
  deleteApiKey,
} from '../../db/queries/apiKeys.js';

const router = Router();

// GET / - List all API keys (never show full key)
router.get('/', (_req: Request, res: Response) => {
  try {
    const keys = listApiKeys();
    const safe = keys.map(({ key_hash: _hash, ...rest }) => ({
      id: rest.id,
      label: rest.label,
      prefix: rest.key_prefix,
      active: Boolean(rest.active),
      lastUsedAt: rest.last_used_at,
      createdAt: rest.created_at,
    }));
    res.json(safe);
  } catch (error) {
    console.error('[routes/admin/apiKeys] GET / error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

// POST / - Create API key (returns full key ONCE)
router.post('/', (req: Request, res: Response) => {
  try {
    const { label } = req.body;
    if (!label) {
      res.status(400).json({ error: 'label is required' });
      return;
    }

    const result = createApiKey(label);

    res.status(201).json({
      id: result.id,
      key: result.key,
      prefix: result.keyPrefix,
      label,
    });
  } catch (error) {
    console.error('[routes/admin/apiKeys] POST / error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

// PUT /:id - Toggle active status
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { active } = req.body;
    if (active === undefined || typeof active !== 'boolean') {
      res.status(400).json({ error: 'active (boolean) is required' });
      return;
    }

    toggleApiKey(id, active);
    res.json({ id, active });
  } catch (error) {
    console.error('[routes/admin/apiKeys] PUT /:id error:', error);
    res.status(500).json({ error: 'Failed to toggle API key' });
  }
});

// DELETE /:id - Delete API key
router.delete('/:id', (req: Request, res: Response) => {
  try {
    deleteApiKey(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    console.error('[routes/admin/apiKeys] DELETE /:id error:', error);
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

export default router;
