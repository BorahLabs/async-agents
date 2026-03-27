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
import { PROVIDER_REGISTRY } from '../../providers.js';

const router = Router();

function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '***';
  return key.slice(0, 8) + '...';
}

function maskEnvVars(envVarsJson: string | null): string | null {
  if (!envVarsJson) return null;
  try {
    const parsed = JSON.parse(envVarsJson) as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || value.length <= 8) {
        masked[key] = '***';
      } else {
        masked[key] = value.slice(0, 8) + '...';
      }
    }
    return JSON.stringify(masked);
  } catch {
    return null;
  }
}

function maskProvider(provider: Provider) {
  return {
    ...provider,
    api_key: maskApiKey(provider.api_key),
    env_vars: maskEnvVars(provider.env_vars),
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
    const { name, type, base_url, api_key, models, env_vars } = req.body;

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
      env_vars: env_vars
        ? typeof env_vars === 'string'
          ? env_vars
          : JSON.stringify(env_vars)
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

    const { name, type, base_url, api_key, models, env_vars } = req.body;

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
      env_vars: env_vars !== undefined
        ? typeof env_vars === 'string'
          ? env_vars
          : JSON.stringify(env_vars)
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

// GET /registry - Return provider registry for frontend
router.get('/registry', (_req: Request, res: Response) => {
  res.json(PROVIDER_REGISTRY);
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
