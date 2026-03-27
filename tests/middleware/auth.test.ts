import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock the DB query modules BEFORE importing the middleware
vi.mock('../../src/db/queries/apiKeys.js', () => ({
  listApiKeys: vi.fn(),
  getApiKeyByHash: vi.fn(),
  updateLastUsed: vi.fn(),
}));

vi.mock('../../src/utils/crypto.js', () => ({
  hashApiKey: vi.fn(),
}));

import { authMiddleware } from '../../src/middleware/auth.js';
import { listApiKeys, getApiKeyByHash, updateLastUsed } from '../../src/db/queries/apiKeys.js';
import { hashApiKey } from '../../src/utils/crypto.js';

const mockedListApiKeys = vi.mocked(listApiKeys);
const mockedGetApiKeyByHash = vi.mocked(getApiKeyByHash);
const mockedUpdateLastUsed = vi.mocked(updateLastUsed);
const mockedHashApiKey = vi.mocked(hashApiKey);

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/sessions',
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { _status: number | null; _json: unknown } {
  const res = {
    _status: null as number | null,
    _json: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as unknown as Response & { _status: number | null; _json: unknown };
}

describe('authMiddleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    next = vi.fn();
  });

  it('skips auth for /api/admin paths', () => {
    const req = createMockReq({ path: '/api/admin/settings' });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('skips auth for non-/api/ paths', () => {
    const req = createMockReq({ path: '/index.html' });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('skips auth for static file paths', () => {
    const req = createMockReq({ path: '/assets/style.css' });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('skips auth when no API keys exist (bootstrap mode)', () => {
    mockedListApiKeys.mockReturnValue([]);
    const req = createMockReq({ path: '/api/sessions' });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
  });

  it('returns 401 when no Authorization header is present', () => {
    mockedListApiKeys.mockReturnValue([{ id: '1', label: 'test', key_hash: 'h', key_prefix: 'sk_', active: 1, last_used_at: null, created_at: '' }]);
    const req = createMockReq({ path: '/api/sessions', headers: {} });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 when Authorization header is malformed', () => {
    mockedListApiKeys.mockReturnValue([{ id: '1', label: 'test', key_hash: 'h', key_prefix: 'sk_', active: 1, last_used_at: null, created_at: '' }]);
    const req = createMockReq({
      path: '/api/sessions',
      headers: { authorization: 'Basic abc123' },
    });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  it('returns 401 for an invalid API key', () => {
    mockedListApiKeys.mockReturnValue([{ id: '1', label: 'test', key_hash: 'h', key_prefix: 'sk_', active: 1, last_used_at: null, created_at: '' }]);
    mockedHashApiKey.mockReturnValue('bad-hash');
    mockedGetApiKeyByHash.mockReturnValue(undefined);

    const req = createMockReq({
      path: '/api/sessions',
      headers: { authorization: 'Bearer sk_invalid' },
    });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect((res._json as any).error).toMatch(/invalid/i);
  });

  it('returns 401 for an inactive API key', () => {
    mockedListApiKeys.mockReturnValue([{ id: '1', label: 'test', key_hash: 'h', key_prefix: 'sk_', active: 1, last_used_at: null, created_at: '' }]);
    mockedHashApiKey.mockReturnValue('valid-hash');
    mockedGetApiKeyByHash.mockReturnValue({
      id: '1',
      label: 'test',
      key_hash: 'valid-hash',
      key_prefix: 'sk_abcde',
      active: 0,
      last_used_at: null,
      created_at: '',
    });

    const req = createMockReq({
      path: '/api/sessions',
      headers: { authorization: 'Bearer sk_validbutinactive' },
    });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect((res._json as any).error).toMatch(/inactive/i);
  });

  it('calls next() and updates last_used_at for a valid key', () => {
    mockedListApiKeys.mockReturnValue([{ id: '1', label: 'test', key_hash: 'h', key_prefix: 'sk_', active: 1, last_used_at: null, created_at: '' }]);
    mockedHashApiKey.mockReturnValue('valid-hash');
    mockedGetApiKeyByHash.mockReturnValue({
      id: 'key-123',
      label: 'my-key',
      key_hash: 'valid-hash',
      key_prefix: 'sk_abcde',
      active: 1,
      last_used_at: null,
      created_at: '',
    });

    const req = createMockReq({
      path: '/api/sessions',
      headers: { authorization: 'Bearer sk_real_valid_key' },
    });
    const res = createMockRes();

    authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeNull();
    expect(mockedUpdateLastUsed).toHaveBeenCalledWith('key-123');
  });
});
