import { Router } from 'express';
import type { Request, Response } from 'express';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { validateFolderName, getFolderPath } from '../utils/validation.js';
import { getSetting } from '../db/queries/settings.js';

const router = Router();

// POST /clone - Clone repo via gh CLI
router.post('/clone', (req: Request, res: Response) => {
  try {
    const { repo, branch, folder } = req.body;

    if (!repo || !folder) {
      res.status(400).json({ error: 'repo and folder are required' });
      return;
    }

    const validation = validateFolderName(folder);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const githubToken = getSetting('github_token');
    if (!githubToken) {
      res.status(400).json({ error: 'GitHub token is not configured. Set it via admin settings.' });
      return;
    }

    const folderPath = getFolderPath(folder);
    fs.mkdirSync(folderPath, { recursive: true });

    const env = { ...process.env, GH_TOKEN: githubToken };

    // Build clone command
    let cloneCmd = `gh repo clone ${repo} ${folderPath}`;
    if (branch) {
      cloneCmd += ` -- --branch ${branch}`;
    }

    execSync(cloneCmd, { env, stdio: 'pipe', timeout: 120_000 });

    // Get commit SHA
    const commitSha = execSync('git rev-parse HEAD', {
      cwd: folderPath,
      env,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();

    res.status(201).json({
      folder,
      repo,
      branch: branch ?? null,
      commitSha,
    });
  } catch (error) {
    console.error('[routes/git] POST /clone error:', error);
    const message = error instanceof Error ? error.message : 'Failed to clone repository';
    res.status(500).json({ error: message });
  }
});

export default router;
