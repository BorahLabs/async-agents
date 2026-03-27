import { Router } from 'express';
import type { Request, Response } from 'express';
import { execSync } from 'node:child_process';
import { getSetting } from '../../db/queries/settings.js';

const router = Router();

// POST /test - Test GitHub token
router.post('/test', (_req: Request, res: Response) => {
  try {
    const githubToken = getSetting('github_token');
    if (!githubToken) {
      res.status(400).json({
        success: false,
        error: 'GitHub token is not configured',
      });
      return;
    }

    const env = { ...process.env, GH_TOKEN: githubToken };

    const output = execSync('gh auth status', {
      env,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 15_000,
    });

    res.json({
      success: true,
      message: output.trim(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'GitHub auth test failed';
    // gh auth status exits with non-zero on failure but still prints useful info to stderr
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr: unknown }).stderr).trim()
        : undefined;

    res.status(400).json({
      success: false,
      error: stderr || message,
    });
  }
});

export default router;
