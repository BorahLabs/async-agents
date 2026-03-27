import path from 'node:path';

const FOLDER_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates a folder name.
 * Must be non-empty, contain only alphanumeric characters, hyphens, and underscores.
 * No slashes, no leading dots, no "..".
 */
export function validateFolderName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Folder name must not be empty' };
  }

  if (name.startsWith('.')) {
    return { valid: false, error: 'Folder name must not start with a dot' };
  }

  if (name.includes('..')) {
    return { valid: false, error: 'Folder name must not contain ".."' };
  }

  if (name.includes('/') || name.includes('\\')) {
    return { valid: false, error: 'Folder name must not contain slashes' };
  }

  if (!FOLDER_NAME_RE.test(name)) {
    return { valid: false, error: 'Folder name may only contain alphanumeric characters, hyphens, and underscores' };
  }

  return { valid: true };
}

/**
 * Validates a relative file path within a folder.
 * Must not contain ".." segments and must not be an absolute path.
 */
export function validateRelativePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || filePath.trim().length === 0) {
    return { valid: false, error: 'Path must not be empty' };
  }

  if (path.isAbsolute(filePath)) {
    return { valid: false, error: 'Path must be relative, not absolute' };
  }

  const normalized = path.normalize(filePath);
  if (normalized.startsWith('..') || normalized.includes(`${path.sep}..`)) {
    return { valid: false, error: 'Path must not contain ".." segments' };
  }

  return { valid: true };
}

/**
 * Returns the full path for a folder under the data directory.
 * Uses the DATA_PATH environment variable, defaulting to './data'.
 */
export function getFolderPath(folder: string): string {
  const dataDir = process.env.DATA_PATH || './data';
  return path.join(dataDir, folder);
}

/**
 * Returns the full path for a file within a folder under the data directory.
 */
export function getFilePath(folder: string, relativePath: string): string {
  return path.join(getFolderPath(folder), relativePath);
}
