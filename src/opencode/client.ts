import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { listProviders } from "../db/queries/providers.js"
import { generateSessionConfig } from "./config.js"
import type { McpServerInput, SkillInput } from "./config.js"

// 4 hour timeout for agent prompts (agents can do complex multi-step work)
const PROMPT_TIMEOUT_MS = 4 * 60 * 60 * 1000

const DATA_PATH = process.env.DATA_PATH ?? "./data"
const OPENCODE_CONFIG_DIR = path.join(process.env.HOME ?? "/root", ".config", "opencode")

export interface OpenCodeInstance {
  client: OpencodeClient
  id: number
}

export interface PromptParams {
  sessionId: string
  opencodeSessionId?: string | null
  text: string
  systemPrompt?: string | null
  provider: string
  model: string
  mcpServers?: McpServerInput[]
  skills?: SkillInput[]
  workingDirectory?: string | null
  structuredOutputSchema?: string | null
}

export interface ToolCallResult {
  toolName: string
  input: string
  output: string
  durationMs?: number
}

export interface PromptResult {
  opencodeSessionId: string
  content: string
  toolCalls: ToolCallResult[]
  tokenUsage: Record<string, unknown>
  structuredOutput?: unknown
}

/**
 * Map provider type IDs to the environment variable names OpenCode expects.
 */
const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "google-generative-ai": "GOOGLE_GENERATIVE_AI_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  "fireworks-ai": "FIREWORKS_API_KEY",
  "together-ai": "TOGETHER_AI_API_KEY",
  cohere: "COHERE_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  "deep-infra": "DEEP_INFRA_API_KEY",
  "hugging-face": "HUGGING_FACE_HUB_TOKEN",
  "venice-ai": "VENICE_API_KEY",
  "moonshot-ai": "MOONSHOT_API_KEY",
}

/**
 * Inject all configured provider API keys into process.env so
 * OpenCode Go processes inherit them.
 */
function injectProviderEnvVars(): void {
  const providers = listProviders()
  for (const provider of providers) {
    const envKey = PROVIDER_ENV_MAP[provider.type]
    if (envKey && provider.api_key) {
      process.env[envKey] = provider.api_key
    }
    if (provider.env_vars) {
      try {
        const extra = JSON.parse(provider.env_vars) as Record<string, string>
        for (const [key, value] of Object.entries(extra)) {
          if (key && value) process.env[key] = value
        }
      } catch { /* ignore */ }
    }
  }
}

/**
 * Write an opencode.json with MCP servers into a project directory.
 * OpenCode reads mcpServers from project-level config (requires git repo).
 * Also ensures the directory is a git repo (OpenCode needs this).
 */
function writeProjectConfig(projectDir: string, mcpServers?: McpServerInput[]): void {
  fs.mkdirSync(projectDir, { recursive: true })

  // Ensure it's a git repo (OpenCode requires this to find project root)
  const gitDir = path.join(projectDir, ".git")
  if (!fs.existsSync(gitDir)) {
    try {
      execSync("git init", { cwd: projectDir, stdio: "pipe" })
    } catch { /* ignore if git init fails */ }
  }

  const configPath = path.join(projectDir, "opencode.json")
  if (mcpServers && mcpServers.length > 0) {
    const config = generateSessionConfig({
      provider: "default",
      model: "default",
      mcpServers,
    })
    // config.mcp is the OpenCode 1.3.3 format
    fs.writeFileSync(configPath, JSON.stringify({ mcp: config.mcp }, null, 2), "utf-8")
    console.log(`[opencode] Wrote MCP config to ${configPath} with ${mcpServers.length} server(s)`)
  } else if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath)
  }
}

/**
 * Ensure the global config is clean (no stale MCP config at global level).
 */
function cleanGlobalConfig(): void {
  fs.mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true })
  const configPath = path.join(OPENCODE_CONFIG_DIR, "opencode.json")
  fs.writeFileSync(configPath, "{}", "utf-8")
}

/**
 * Create a new OpenCode instance for a worker.
 */
export async function createWorkerInstance(workerId: number): Promise<OpenCodeInstance> {
  injectProviderEnvVars()
  cleanGlobalConfig()
  const defaultDir = path.resolve(DATA_PATH)
  fs.mkdirSync(defaultDir, { recursive: true })
  const port = 4096 + workerId
  const { client } = await createOpencode({
    hostname: "127.0.0.1",
    port,
  })
  return { client, id: workerId }
}

// Track port offsets for reconfigured instances
let nextPortOffset = 100

/**
 * Reconfigure the OpenCode instance for a session that needs MCP servers.
 * Writes opencode.json into the session's working directory (project-level config),
 * then starts a new OpenCode instance in that directory so it picks up the MCP config.
 */
export async function reconfigureForSession(
  _instance: OpenCodeInstance,
  workerId: number,
  mcpServers?: McpServerInput[],
  workingDirectory?: string | null,
): Promise<OpenCodeInstance> {
  injectProviderEnvVars()

  const sessionDir = workingDirectory
    ? path.resolve(DATA_PATH, workingDirectory)
    : path.resolve(DATA_PATH, `_worker_${workerId}`)

  // Write project-level opencode.json with MCP servers
  writeProjectConfig(sessionDir, mcpServers)

  // chdir so the new OpenCode process starts in the project directory
  const originalCwd = process.cwd()
  process.chdir(sessionDir)

  try {
    const port = 4096 + nextPortOffset++
    console.log(`[opencode] Starting OpenCode in ${sessionDir} with ${mcpServers?.length ?? 0} MCP server(s) on port ${port}`)
    const { client } = await createOpencode({
      hostname: "127.0.0.1",
      port,
    })
    return { client, id: workerId }
  } finally {
    process.chdir(originalCwd)
  }
}

/**
 * Send a prompt to a session on a specific OpenCode instance.
 */
export async function executePrompt(
  instance: OpenCodeInstance,
  params: PromptParams,
): Promise<PromptResult> {
  const { client } = instance

  // If no existing OpenCode session, create one
  let opencodeSessionId = params.opencodeSessionId ?? null
  if (!opencodeSessionId) {
    const sessionResponse = await client.session.create({
      body: { title: params.sessionId },
    })
    if (!sessionResponse.data) {
      throw new Error("Failed to create OpenCode session: no data returned")
    }
    opencodeSessionId = sessionResponse.data.id
  }

  // Build prompt text — if skills are specified, ask the agent to load them
  let promptText = params.text
  if (params.skills && params.skills.length > 0) {
    const skillNames = params.skills.map(s => s.name).join(", ")
    promptText += `\n\n[Load and apply the following skills: ${skillNames}]`
  }

  const parts: Array<{ type: "text"; text: string }> = [
    { type: "text", text: promptText },
  ]

  const promptBody: Record<string, unknown> = {
    parts,
    model: {
      providerID: params.provider,
      modelID: params.model,
    },
  }

  if (params.systemPrompt && params.systemPrompt.trim().length > 0 && params.systemPrompt !== "string") {
    promptBody.system = params.systemPrompt.trim()
  }

  if (params.structuredOutputSchema) {
    try {
      const parsedSchema = JSON.parse(params.structuredOutputSchema) as Record<string, unknown>
      if (Object.keys(parsedSchema).length > 0) {
        promptBody.format = { type: "json_schema", schema: parsedSchema }
      }
    } catch {
      console.warn(`[opencode] Invalid structuredOutputSchema, skipping`)
    }
  }

  // Send the prompt with 4-hour timeout
  const promptPromise = client.session.prompt({
    path: { id: opencodeSessionId },
    body: promptBody as Parameters<typeof client.session.prompt>[0]["body"],
  })
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Prompt timed out after ${PROMPT_TIMEOUT_MS / 1000}s`)), PROMPT_TIMEOUT_MS)
  )
  const promptResponse = await Promise.race([promptPromise, timeoutPromise])

  // Extract response
  let responseData = promptResponse.data as Record<string, unknown> | undefined

  if (!responseData || !responseData.parts) {
    // Fallback: fetch messages from the session
    const messagesResponse = await client.session.messages({
      path: { id: opencodeSessionId },
    })
    const messages = (messagesResponse.data ?? []) as Array<Record<string, unknown>>

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const msgInfo = msg.info as Record<string, unknown> | undefined
      if (msgInfo?.role === "assistant") {
        responseData = msg
        break
      }
    }

    if (!responseData || !responseData.parts) {
      throw new Error(
        `OpenCode returned an empty response. This usually means the model "${params.model}" is invalid or the provider "${params.provider}" is not configured correctly.`
      )
    }
  }

  // Extract content
  let content = ""
  let structuredOutput: unknown = undefined
  const toolCalls: ToolCallResult[] = []
  const responseParts = (responseData.parts ?? []) as Array<Record<string, unknown>>

  for (const part of responseParts) {
    if (part.type === "text" && typeof part.text === "string") {
      content += part.text
    } else if (part.type === "tool-invocation" || part.type === "tool_use") {
      toolCalls.push({
        toolName: (part.toolName ?? part.name ?? "unknown") as string,
        input: typeof part.input === "string" ? part.input : JSON.stringify(part.input ?? {}),
        output: typeof part.output === "string" ? part.output : JSON.stringify(part.output ?? {}),
        durationMs: typeof part.durationMs === "number" ? part.durationMs : undefined,
      })
      if (
        (part.toolName === "StructuredOutput" || part.name === "StructuredOutput") &&
        part.output != null
      ) {
        try {
          structuredOutput = typeof part.output === "string" ? JSON.parse(part.output) : part.output
        } catch {
          structuredOutput = part.output
        }
      }
    }
  }

  if (params.structuredOutputSchema && structuredOutput === undefined && content) {
    try { structuredOutput = JSON.parse(content) } catch { /* not JSON */ }
  }

  // Extract token usage
  let tokenUsage: Record<string, unknown> = {}
  const info = responseData.info as Record<string, unknown> | undefined
  if (info?.tokens && typeof info.tokens === "object") {
    tokenUsage = info.tokens as Record<string, unknown>
  }

  const result: PromptResult = { opencodeSessionId, content, toolCalls, tokenUsage }
  if (structuredOutput !== undefined) result.structuredOutput = structuredOutput
  return result
}
