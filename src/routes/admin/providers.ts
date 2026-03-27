import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listProviders,
  createProvider,
  getProvider,
  updateProvider,
  deleteProvider,
} from '../../db/queries/providers.js';
import type { Provider } from '../../db/queries/providers.js';

const router = Router();

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '***';
  return key.slice(0, 8) + '...';
}

function maskProvider(provider: Provider) {
  return {
    ...provider,
    api_key: maskApiKey(provider.api_key),
  };
}

// GET / - List all providers (mask API keys)
router.get('/', (_req: Request, res: Response) => {
  try {
    const providers = listProviders();
    res.json(providers.map(maskProvider));
  } catch (error) {
    console.error('[routes/admin/providers] GET / error:', error);
    res.status(500).json({ error: 'Failed to list providers' });
  }
});

// POST / - Create provider
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, base_url, api_key, models } = req.body;

    if (!name || !type || !api_key) {
      res.status(400).json({ error: 'name, type, and api_key are required' });
      return;
    }

    const provider = createProvider({
      name,
      type,
      base_url: base_url ?? null,
      api_key,
      models: models
        ? typeof models === 'string'
          ? models
          : JSON.stringify(models)
        : null,
    });

    res.status(201).json(maskProvider(provider));
  } catch (error) {
    console.error('[routes/admin/providers] POST / error:', error);
    res.status(500).json({ error: 'Failed to create provider' });
  }
});

// PUT /:id - Update provider
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getProvider(id);
    if (!existing) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    const { name, type, base_url, api_key, models } = req.body;

    const updated = updateProvider(id, {
      name,
      type,
      base_url,
      api_key,
      models: models !== undefined
        ? typeof models === 'string'
          ? models
          : JSON.stringify(models)
        : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    res.json(maskProvider(updated));
  } catch (error) {
    console.error('[routes/admin/providers] PUT /:id error:', error);
    res.status(500).json({ error: 'Failed to update provider' });
  }
});

// DELETE /:id - Delete provider
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getProvider(id);
    if (!existing) {
      res.status(404).json({ error: 'Provider not found' });
      return;
    }

    deleteProvider(id);
    res.status(204).send();
  } catch (error) {
    console.error('[routes/admin/providers] DELETE /:id error:', error);
    res.status(500).json({ error: 'Failed to delete provider' });
  }
});

export default router;
