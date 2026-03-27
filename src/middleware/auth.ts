import type { Request, Response, NextFunction } from 'express';
import { hashApiKey } from '../utils/crypto.js';
import { getApiKeyByHash, updateLastUsed, listApiKeys } from '../db/queries/apiKeys.js';

/**
 * Express middleware that enforces API key authentication on /api/* routes.
 *
 * - Skips auth for paths starting with /api/admin (admin panel API is unprotected).
 * - Skips auth for paths NOT starting with /api/ (static files, etc.).
 * - If no API keys exist in the database at all, skips auth (bootstrapping mode).
 * - For all other /api/* paths, requires an Authorization: Bearer <key> header.
 * - Looks up the key by hashing it and querying the api_keys table.
 * - If the key is not found or inactive, returns 401.
 * - If found, updates last_used_at and calls next().
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for non-API paths (static files, etc.)
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  // Skip auth for admin panel API
  if (req.path.startsWith('/api/admin')) {
    next();
    return;
  }

  // Bootstrapping mode: if no API keys exist yet, skip auth
  const allKeys = listApiKeys();
  if (allKeys.length === 0) {
    next();
    return;
  }

  // Extract bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header. Expected: Bearer <api_key>' });
    return;
  }

  const token = authHeader.slice(7);
  if (!token) {
    res.status(401).json({ error: 'API key must not be empty' });
    return;
  }

  // Look up the key by hash
  const hash = hashApiKey(token);
  const keyRow = getApiKeyByHash(hash);

  if (!keyRow) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  if (!keyRow.active) {
    res.status(401).json({ error: 'API key is inactive' });
    return;
  }

  // Update last_used_at and proceed
  updateLastUsed(keyRow.id);
  next();
}
