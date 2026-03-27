import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listSkills,
  createSkill,
  getSkill,
  getSkillByName,
  updateSkill,
  deleteSkill,
} from '../../db/queries/skills.js';
import { getSetting } from '../../db/queries/settings.js';

const router = Router();

// GET / - List all skills
router.get('/', (_req: Request, res: Response) => {
  try {
    const skills = listSkills();
    res.json(skills);
  } catch (error) {
    console.error('[routes/admin/skills] GET / error:', error);
    res.status(500).json({ error: 'Failed to list skills' });
  }
});

// POST / - Create skill
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, system_prompt, allowed_tools, model_provider, model_id, description } = req.body;

    if (!name || !system_prompt) {
      res.status(400).json({ error: 'name and system_prompt are required' });
      return;
    }

    const skill = createSkill({
      name,
      system_prompt,
      allowed_tools: allowed_tools
        ? typeof allowed_tools === 'string'
          ? allowed_tools
          : JSON.stringify(allowed_tools)
        : null,
      model_provider: model_provider ?? null,
      model_id: model_id ?? null,
      description: description ?? null,
    });

    res.status(201).json(skill);
  } catch (error) {
    console.error('[routes/admin/skills] POST / error:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /:id - Update skill
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getSkill(id);
    if (!existing) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    const { name, system_prompt, allowed_tools, model_provider, model_id, description } = req.body;

    const updated = updateSkill(id, {
      name,
      system_prompt,
      allowed_tools: allowed_tools !== undefined
        ? typeof allowed_tools === 'string'
          ? allowed_tools
          : JSON.stringify(allowed_tools)
        : undefined,
      model_provider,
      model_id,
      description,
    });

    if (!updated) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error('[routes/admin/skills] PUT /:id error:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /:id - Delete skill
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const existing = getSkill(id);
    if (!existing) {
      res.status(404).json({ error: 'Skill not found' });
      return;
    }

    deleteSkill(id);
    res.status(204).send();
  } catch (error) {
    console.error('[routes/admin/skills] DELETE /:id error:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// POST /import - Import skills from a GitHub repo URL
// Supports:
//   https://github.com/owner/repo                     -> looks for /skills folder
//   https://github.com/owner/repo/tree/branch/path    -> looks for /skills folder inside path
router.post('/import', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'url is required' });
      return;
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid GitHub URL. Expected: https://github.com/owner/repo or https://github.com/owner/repo/tree/branch/path' });
      return;
    }

    const { owner, repo, branch, path: basePath } = parsed;

    // 1. Find the skills directory
    const skillsDir = await findSkillsDir(owner, repo, branch, basePath);
    if (!skillsDir) {
      res.status(400).json({ error: `No skills folder found in ${basePath || 'repository root'}. Expected a "skills" directory containing skill subdirectories with SKILL.md files.` });
      return;
    }

    // 2. List subdirectories inside the skills dir (each one is a skill)
    const skillFolders = await listGitHubDir(owner, repo, skillsDir.ref, skillsDir.path);
    const dirs = skillFolders.filter((e: GitHubEntry) => e.type === 'dir');

    if (dirs.length === 0) {
      res.status(400).json({ error: 'No skill subdirectories found inside the skills folder.' });
      return;
    }

    // 3. For each skill folder, fetch SKILL.md and parse it
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const dir of dirs) {
      try {
        const skillMdPath = `${dir.path}/SKILL.md`;
        const content = await fetchFileContent(owner, repo, skillMdPath, skillsDir.ref);
        if (!content) {
          skipped.push(`${dir.name}: no SKILL.md found`);
          continue;
        }

        const parsed = parseSkillMd(content);
        if (!parsed) {
          skipped.push(`${dir.name}: failed to parse SKILL.md frontmatter`);
          continue;
        }

        const skillName = parsed.name || dir.name;

        // Check if skill already exists — update if so, create if not
        const existing = getSkillByName(skillName);
        if (existing) {
          updateSkill(existing.id, {
            system_prompt: parsed.systemPrompt,
            description: parsed.description || undefined,
          });
          imported.push(`${skillName} (updated)`);
        } else {
          createSkill({
            name: skillName,
            system_prompt: parsed.systemPrompt,
            allowed_tools: null,
            model_provider: null,
            model_id: null,
            description: parsed.description || null,
          });
          imported.push(skillName);
        }
      } catch (e) {
        errors.push(`${dir.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    res.json({ imported, skipped, errors, total: dirs.length });
  } catch (error) {
    console.error('[routes/admin/skills] POST /import error:', error);
    res.status(500).json({ error: 'Failed to import skills' });
  }
});

// --- GitHub helpers ---

interface GitHubEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string; path?: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;

    const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/');
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1];

    // https://github.com/owner/repo
    if (parts.length === 2) {
      return { owner, repo };
    }

    // https://github.com/owner/repo/tree/branch/path/to/dir
    if (parts[2] === 'tree' && parts.length >= 4) {
      const branch = parts[3];
      const path = parts.slice(4).join('/') || undefined;
      return { owner, repo, branch, path };
    }

    return { owner, repo };
  } catch {
    return null;
  }
}

async function ghApi(endpoint: string): Promise<unknown> {
  const ghToken = getSetting('github_token') || process.env.GH_TOKEN || '';
  const headers: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`;
  const res = await fetch(`https://api.github.com/${endpoint}`, { headers });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function listGitHubDir(owner: string, repo: string, ref: string | undefined, path: string): Promise<GitHubEntry[]> {
  const refParam = ref ? `?ref=${ref}` : '';
  const data = await ghApi(`repos/${owner}/${repo}/contents/${path}${refParam}`);
  if (!Array.isArray(data)) return [];
  return (data as Array<{ name: string; path: string; type: string }>).map(e => ({
    name: e.name,
    path: e.path,
    type: e.type as 'file' | 'dir',
  }));
}

async function findSkillsDir(
  owner: string,
  repo: string,
  branch?: string,
  basePath?: string
): Promise<{ path: string; ref?: string } | null> {
  const ref = branch;
  const searchPath = basePath || '';

  // Check if the basePath itself IS a skills directory (contains SKILL.md subdirs)
  try {
    const entries = await listGitHubDir(owner, repo, ref, searchPath);
    const hasSkillsSubdir = entries.find(e => e.name === 'skills' && e.type === 'dir');
    if (hasSkillsSubdir) {
      return { path: hasSkillsSubdir.path, ref };
    }

    // Maybe the basePath itself contains skill folders with SKILL.md
    const hasDirsWithSkillMd = entries.some(e => e.type === 'dir');
    if (hasDirsWithSkillMd) {
      // Check if any subdir has a SKILL.md — if so, basePath itself is the skills dir
      for (const entry of entries) {
        if (entry.type === 'dir') {
          try {
            const subEntries = await listGitHubDir(owner, repo, ref, entry.path);
            if (subEntries.some(e => e.name === 'SKILL.md')) {
              return { path: searchPath, ref };
            }
          } catch {
            continue;
          }
          break; // Only check the first subdir to avoid too many API calls
        }
      }
    }
  } catch {
    // path not found
  }

  return null;
}

async function fetchFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
  try {
    const refParam = ref ? `?ref=${ref}` : '';
    const data = await ghApi(`repos/${owner}/${repo}/contents/${path}${refParam}`) as { content?: string; encoding?: string };
    if (!data.content) return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function parseSkillMd(content: string): { name?: string; description?: string; systemPrompt: string } | null {
  // Parse YAML frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    // No frontmatter — treat entire content as system prompt
    return { systemPrompt: content.trim() };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  // Simple YAML parsing for name and description
  let name: string | undefined;
  let description: string | undefined;

  for (const line of frontmatter.split('\n')) {
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) name = nameMatch[1].trim();

    const descMatch = line.match(/^description:\s*(.+)$/);
    if (descMatch) description = descMatch[1].trim();
  }

  if (!body) return null;

  return { name, description, systemPrompt: body };
}

export default router;
