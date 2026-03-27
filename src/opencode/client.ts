import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk"
import { listProviders } from "../db/queries/providers.js"

export interface OpenCodeInstance {
  client: OpencodeClient
  id: number // worker ID
}

export interface PromptParams {
  sessionId: string // our DB session ID
  opencodeSessionId?: string | null // OpenCode's internal session ID (if session already exists)
  text: string
  systemPrompt?: string | null
  provider: string
  model: string
  mcpServers?: Array<{
    name: string
    type: string
    command?: string
    url?: string
    env_vars?: string
  }>
  skills?: Array<{
    name: string
    system_prompt: string
    allowed_tools?: string
    model_provider?: string
    model_id?: string
  }>
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
 * Inject all configured provider API keys into process.env so the
 * OpenCode Go server (spawned as a child process) inherits them.
 */
function injectProviderEnvVars(): void {
  const providers = listProviders()
  for (const provider of providers) {
    const envKey = PROVIDER_ENV_MAP[provider.type]
    if (envKey && provider.api_key) {
      process.env[envKey] = provider.api_key
    }
    // Also inject any extra env vars from the provider config
    if (provider.env_vars) {
      try {
        const extra = JSON.parse(provider.env_vars) as Record<string, string>
        for (const [key, value] of Object.entries(extra)) {
          if (key && value) process.env[key] = value
        }
      } catch { /* ignore invalid JSON */ }
    }
  }
}

/**
 * Create a new OpenCode instance for a worker.
 * Each instance starts its own Go server process on a unique port.
 * Injects all configured provider API keys into the environment first.
 */
export async function createWorkerInstance(workerId: number): Promise<OpenCodeInstance> {
  injectProviderEnvVars()
  const port = 4096 + workerId
  const { client } = await createOpencode({
    hostname: "127.0.0.1",
    port,
  })
  return { client, id: workerId }
}

/**
 * Send a prompt to a session on a specific OpenCode instance.
 * Handles session creation if needed, configures model, structured output, etc.
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

  // Build prompt body parts
  const parts: Array<{ type: "text"; text: string }> = [
    { type: "text", text: params.text },
  ]

  // Build the prompt request body
  const promptBody: Record<string, unknown> = {
    parts,
    model: {
      providerID: params.provider,
      modelID: params.model,
    },
  }

  // Inject system prompt if provided and non-trivial
  if (params.systemPrompt && params.systemPrompt.trim().length > 0 && params.systemPrompt !== 'string') {
    promptBody.system = params.systemPrompt
  }

  // Add structured output schema if provided (skip empty schemas)
  if (params.structuredOutputSchema) {
    try {
      const parsedSchema = JSON.parse(params.structuredOutputSchema) as Record<string, unknown>
      // Only apply if schema has actual properties (not just "{}")
      if (Object.keys(parsedSchema).length > 0) {
        promptBody.format = {
          type: "json_schema",
          schema: parsedSchema,
        }
      }
    } catch {
      // Invalid JSON — skip structured output rather than failing
      console.warn(`[opencode] Invalid structuredOutputSchema, skipping: ${params.structuredOutputSchema.slice(0, 100)}`)
    }
  }

  // Send the prompt — response contains the assistant message directly
  const promptResponse = await client.session.prompt({
    path: { id: opencodeSessionId },
    body: promptBody as Parameters<typeof client.session.prompt>[0]["body"],
  })

  // The prompt() returns the assistant message in .data with { info, parts }
  // If .data is empty (e.g. provider not configured), fall back to fetching messages
  let responseData = promptResponse.data as Record<string, unknown> | undefined

  if (!responseData || !responseData.parts) {
    console.log(`[opencode] prompt().data has no parts (keys: ${Object.keys(responseData ?? {}).join(',') || 'none'}), falling back to session messages`)

    // Fall back: fetch messages from the session and find the last assistant message
    const messagesResponse = await client.session.messages({
      path: { id: opencodeSessionId },
    })
    const messages = (messagesResponse.data ?? []) as Array<Record<string, unknown>>
    console.log(`[opencode] Session has ${messages.length} messages`)

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const msgInfo = msg.info as Record<string, unknown> | undefined
      if (msgInfo?.role === 'assistant') {
        responseData = msg
        console.log(`[opencode] Found assistant message with ${((msg.parts as unknown[]) ?? []).length} parts`)
        break
      }
    }
  }

  // Extract content from the response parts
  let content = ""
  let structuredOutput: unknown = undefined
  const toolCalls: ToolCallResult[] = []

  if (responseData) {
    const parts = (responseData.parts ?? []) as Array<Record<string, unknown>>

    for (const part of parts) {
      if (part.type === "text" && typeof part.text === "string") {
        content += part.text
      } else if (part.type === "tool-invocation" || part.type === "tool_use") {
        toolCalls.push({
          toolName: (part.toolName ?? part.name ?? "unknown") as string,
          input: typeof part.input === "string" ? part.input : JSON.stringify(part.input ?? {}),
          output: typeof part.output === "string" ? part.output : JSON.stringify(part.output ?? {}),
          durationMs: typeof part.durationMs === "number" ? part.durationMs : undefined,
        })

        // Check if this is the StructuredOutput tool result
        if (
          (part.toolName === "StructuredOutput" || part.name === "StructuredOutput") &&
          part.output != null
        ) {
          try {
            structuredOutput =
              typeof part.output === "string" ? JSON.parse(part.output) : part.output
          } catch {
            structuredOutput = part.output
          }
        }
      }
    }

    // Also try to parse structured output from the text content if schema was requested
    if (params.structuredOutputSchema && structuredOutput === undefined && content) {
      try {
        structuredOutput = JSON.parse(content)
      } catch {
        // Content is not valid JSON; leave structuredOutput undefined
      }
    }
  }

  // Extract token usage from response info.tokens
  let tokenUsage: Record<string, unknown> = {}
  if (responseData) {
    const info = responseData.info as Record<string, unknown> | undefined
    if (info?.tokens && typeof info.tokens === 'object') {
      tokenUsage = info.tokens as Record<string, unknown>
    }
  }

  const result: PromptResult = {
    opencodeSessionId,
    content,
    toolCalls,
    tokenUsage,
  }

  if (structuredOutput !== undefined) {
    result.structuredOutput = structuredOutput
  }

  return result
}
