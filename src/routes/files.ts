import { Router } from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import mime from 'mime-types';
import {
  validateFolderName,
  validateRelativePath,
  getFolderPath,
  getFilePath,
} from '../utils/validation.js';

const upload = multer({ dest: '/tmp/uploads' });

const router = Router();

// POST /:folder - Upload files (multipart/form-data)
router.post('/:folder', upload.array('files'), (req: Request, res: Response) => {
  try {
    const folder = req.params.folder as string;
    const validation = validateFolderName(folder);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const folderPath = getFolderPath(folder);
    fs.mkdirSync(folderPath, { recursive: true });

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const uploaded: { name: string; size: number; path: string }[] = [];

    for (const file of files) {
      const destPath = path.join(folderPath, file.originalname);
      const destDir = path.dirname(destPath);
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(file.path, destPath);
      uploaded.push({
        name: file.originalname,
        size: file.size,
        path: `${folder}/${file.originalname}`,
      });
    }

    res.status(201).json({ uploaded });
  } catch (error) {
    console.error('[routes/files] POST /:folder error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// GET /:folder - List files in folder (recursive)
router.get('/:folder', (req: Request, res: Response) => {
  try {
    const folder = req.params.folder as string;
    const validation = validateFolderName(folder);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const folderPath = getFolderPath(folder);
    if (!fs.existsSync(folderPath)) {
      res.json({ files: [] });
      return;
    }

    const files: { path: string; size: number; modified: string }[] = [];

    function walkDir(dir: string, prefix: string): void {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath, relativePath);
        } else {
          const stat = fs.statSync(fullPath);
          files.push({
            path: relativePath,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        }
      }
    }

    walkDir(folderPath, '');
    res.json({ files });
  } catch (error) {
    console.error('[routes/files] GET /:folder error:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// GET /:folder/* - Retrieve single file
router.get('/:folder/*', (req: Request, res: Response) => {
  try {
    const folder = req.params.folder as string;
    const folderValidation = validateFolderName(folder);
    if (!folderValidation.valid) {
      res.status(400).json({ error: folderValidation.error });
      return;
    }

    const relativePath = (req.params as Record<string, string>)[0];
    if (!relativePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    const pathValidation = validateRelativePath(relativePath);
    if (!pathValidation.valid) {
      res.status(400).json({ error: pathValidation.error });
      return;
    }

    const filePath = getFilePath(folder, relativePath);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('[routes/files] GET /:folder/* error:', error);
    res.status(500).json({ error: 'Failed to retrieve file' });
  }
});

export default router;
