import fs from 'node:fs'
import path from 'node:path'

const SKILLS_DIR = path.join(process.env.HOME ?? '/root', '.config', 'opencode', 'skills')

export interface Skill {
  name: string
  description: string
  systemPrompt: string
  createdAt: string // file mtime
}

// Ensure skills directory exists
function ensureDir(): void {
  fs.mkdirSync(SKILLS_DIR, { recursive: true })
}

// Parse a SKILL.md file into a Skill object
function parseSkillFile(name: string, content: string, mtime: Date): Skill {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  let description = name
  let systemPrompt = content

  if (fmMatch) {
    const frontmatter = fmMatch[1]
    systemPrompt = fmMatch[2].trim()

    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    if (descMatch) description = descMatch[1].trim()
  }

  return { name, description, systemPrompt, createdAt: mtime.toISOString() }
}

// Build the SKILL.md content from skill data
function buildSkillMd(name: string, description: string, systemPrompt: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${systemPrompt}`
}

export function listSkills(): Skill[] {
  ensureDir()
  try {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
    const skills: Skill[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const skillFile = path.join(SKILLS_DIR, entry.name, 'SKILL.md')
      if (!fs.existsSync(skillFile)) continue
      const content = fs.readFileSync(skillFile, 'utf-8')
      const stat = fs.statSync(skillFile)
      skills.push(parseSkillFile(entry.name, content, stat.mtime))
    }
    return skills
  } catch {
    return []
  }
}

export function getSkill(name: string): Skill | undefined {
  ensureDir()
  const skillFile = path.join(SKILLS_DIR, name, 'SKILL.md')
  if (!fs.existsSync(skillFile)) return undefined
  const content = fs.readFileSync(skillFile, 'utf-8')
  const stat = fs.statSync(skillFile)
  return parseSkillFile(name, content, stat.mtime)
}

export function getSkillByName(name: string): Skill | undefined {
  return getSkill(name)
}

export function createSkill(data: { name: string; description: string; systemPrompt: string }): Skill {
  ensureDir()
  const skillDir = path.join(SKILLS_DIR, data.name)
  fs.mkdirSync(skillDir, { recursive: true })
  const skillFile = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillFile, buildSkillMd(data.name, data.description, data.systemPrompt), 'utf-8')
  const stat = fs.statSync(skillFile)
  return { name: data.name, description: data.description, systemPrompt: data.systemPrompt, createdAt: stat.mtime.toISOString() }
}

export function updateSkill(name: string, data: { description?: string; systemPrompt?: string }): Skill | undefined {
  const existing = getSkill(name)
  if (!existing) return undefined

  const description = data.description ?? existing.description
  const systemPrompt = data.systemPrompt ?? existing.systemPrompt

  const skillFile = path.join(SKILLS_DIR, name, 'SKILL.md')
  fs.writeFileSync(skillFile, buildSkillMd(name, description, systemPrompt), 'utf-8')
  const stat = fs.statSync(skillFile)
  return { name, description, systemPrompt, createdAt: stat.mtime.toISOString() }
}

export function deleteSkill(name: string): boolean {
  const skillDir = path.join(SKILLS_DIR, name)
  if (!fs.existsSync(skillDir)) return false
  fs.rmSync(skillDir, { recursive: true, force: true })
  return true
}

export function skillExists(name: string): boolean {
  const skillFile = path.join(SKILLS_DIR, name, 'SKILL.md')
  return fs.existsSync(skillFile)
}
