import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listMcpServers,
  createMcpServer,
  getMcpServer,
  updateMcpServer,
  deleteMcpServer,
} from '../../db/queries/mcpServers.js';
import type { McpServer } from '../../db/queries/mcpServers.js';

const router = Router();

function maskEnvVars(server: McpServer) {
  if (!server.env_vars) return server;

  try {
    const vars = JSON.parse(server.env_vars) as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(vars)) {
      masked[key] = value && value.length > 4
        ? value.slice(0, 4) + '...'
        : '***';
    }
    return { ...server, env_vars: JSON.stringify(masked) };
  } catch {
    return { ...server, env_vars: '***' };
  }
}

// GET / - List all MCP servers (mask env var values)
router.get('/', (_req: Request, res: Response) => {
  try {
    const servers = listMcpServers();
    res.json(servers.map(maskEnvVars));
  } catch (error) {
    console.error('[routes/admin/mcp] GET / error:', error);
    res.status(500).json({ error: 'Failed to list MCP servers' });
  }
});

// POST / - Create MCP server
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, command, url, env_vars, description } = req.body;

    if (!name || !type) {
      res.status(400).json({ error: 'name and type are required' });
      return;
    }

    if (type !== 'stdio' && type !== 'sse') {
      res.status(400).json({ error: 'type must be "stdio" or "sse"' });
      return;
    }

    const server = createMcpServer({
      name,
      type,
      command: command ?? null,
      url: url ?? null,
      env_vars: env_vars
        ? typeof env_vars === 'string'
          ? env_vars
          : JSON.stringify(env_vars)
        : null,
      description: description ?? null,
    });

    res.status(201).json(server);
  } catch (error) {
    console.error('[routes/admin/mcp] POST / error:', error);
    res.status(500).json({ error: 'Failed to create MCP server' });
  }
});

// PUT /:id - Update MCP server
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getMcpServer(id);
    if (!existing) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    const { name, type, command, url, env_vars, description } = req.body;

    if (type !== undefined && type !== 'stdio' && type !== 'sse') {
      res.status(400).json({ error: 'type must be "stdio" or "sse"' });
      return;
    }

    const updated = updateMcpServer(id, {
      name,
      type,
      command,
      url,
      env_vars: env_vars !== undefined
        ? typeof env_vars === 'string'
          ? env_vars
          : JSON.stringify(env_vars)
        : undefined,
      description,
    });

    if (!updated) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error('[routes/admin/mcp] PUT /:id error:', error);
    res.status(500).json({ error: 'Failed to update MCP server' });
  }
});

// DELETE /:id - Delete MCP server
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getMcpServer(id);
    if (!existing) {
      res.status(404).json({ error: 'MCP server not found' });
      return;
    }

    deleteMcpServer(id);
    res.status(204).send();
  } catch (error) {
    console.error('[routes/admin/mcp] DELETE /:id error:', error);
    res.status(500).json({ error: 'Failed to delete MCP server' });
  }
});

export default router;
