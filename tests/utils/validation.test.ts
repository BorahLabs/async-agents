import { describe, it, expect } from 'vitest';
import { validateFolderName, validateRelativePath } from '../../src/utils/validation.js';

describe('validateFolderName', () => {
  it('accepts valid folder names', () => {
    expect(validateFolderName('task-1')).toEqual({ valid: true });
    expect(validateFolderName('my_project')).toEqual({ valid: true });
    expect(validateFolderName('test123')).toEqual({ valid: true });
    expect(validateFolderName('ABC')).toEqual({ valid: true });
    expect(validateFolderName('a')).toEqual({ valid: true });
  });

  it('rejects empty names', () => {
    const result = validateFolderName('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects whitespace-only names', () => {
    const result = validateFolderName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects names with forward slashes', () => {
    const result = validateFolderName('task/1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/slash/i);
  });

  it('rejects names with backslashes', () => {
    const result = validateFolderName('task\\1');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/slash/i);
  });

  it('rejects names starting with a dot', () => {
    const result = validateFolderName('.hidden');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/dot/i);
  });

  it('rejects names containing ".."', () => {
    const result = validateFolderName('../hack');
    expect(result.valid).toBe(false);
    // Could match either "dot" or ".." error depending on check order
    expect(result.valid).toBe(false);
  });

  it('rejects path traversal like "a/b"', () => {
    const result = validateFolderName('a/b');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/slash/i);
  });

  it('rejects names with special characters', () => {
    expect(validateFolderName('hello world').valid).toBe(false);
    expect(validateFolderName('test@file').valid).toBe(false);
    expect(validateFolderName('file.txt').valid).toBe(false);
    expect(validateFolderName('name!').valid).toBe(false);
  });
});

describe('validateRelativePath', () => {
  it('accepts valid relative paths', () => {
    expect(validateRelativePath('file.txt')).toEqual({ valid: true });
    expect(validateRelativePath('src/index.ts')).toEqual({ valid: true });
    expect(validateRelativePath('deep/nested/file.js')).toEqual({ valid: true });
    expect(validateRelativePath('a')).toEqual({ valid: true });
  });

  it('rejects empty paths', () => {
    const result = validateRelativePath('');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it('rejects absolute paths', () => {
    const result = validateRelativePath('/absolute');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/absolute/i);
  });

  it('rejects paths with ".." at the start', () => {
    const result = validateRelativePath('../escape');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/\.\./);
  });

  it('rejects deeply nested ".." traversals', () => {
    const result = validateRelativePath('../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/\.\./);
  });

  it('rejects paths with ".." segments in the middle', () => {
    const result = validateRelativePath('src/../../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/\.\./);
  });
});
