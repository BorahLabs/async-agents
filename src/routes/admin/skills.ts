import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  listSkills,
  createSkill,
  getSkill,
  updateSkill,
  deleteSkill,
} from '../../db/queries/skills.js';

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

export default router;
