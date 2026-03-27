import { createOpencode } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk"

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
 * Create a new OpenCode instance for a worker.
 * Each instance starts its own Go server process on a unique port.
 */
export async function createWorkerInstance(workerId: number): Promise<OpenCodeInstance> {
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

  // Inject system prompt if provided
  if (params.systemPrompt) {
    promptBody.system = params.systemPrompt
  }

  // Add structured output schema if provided
  if (params.structuredOutputSchema) {
    try {
      const parsedSchema = JSON.parse(params.structuredOutputSchema) as Record<string, unknown>
      promptBody.format = {
        type: "json_schema",
        schema: parsedSchema,
      }
    } catch {
      throw new Error(
        `Invalid structuredOutputSchema JSON: ${params.structuredOutputSchema.slice(0, 200)}`,
      )
    }
  }

  // Send the prompt
  await client.session.prompt({
    path: { id: opencodeSessionId },
    body: promptBody as Parameters<typeof client.session.prompt>[0]["body"],
  })

  // Fetch messages to get the assistant response
  const messagesResponse = await client.session.messages({
    path: { id: opencodeSessionId },
  })

  const messages = messagesResponse.data ?? []

  // Find the last assistant message
  const assistantMessages = messages.filter(
    (msg: Record<string, unknown>) => msg.role === "assistant",
  )
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1] as
    | Record<string, unknown>
    | undefined

  // Extract content from the assistant message
  let content = ""
  let structuredOutput: unknown = undefined
  const toolCalls: ToolCallResult[] = []

  if (lastAssistantMessage) {
    const messageParts = (lastAssistantMessage.parts ?? []) as Array<Record<string, unknown>>

    for (const part of messageParts) {
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
            // If parsing fails, keep the raw output
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

  // Extract token usage from the message metadata
  const tokenUsage: Record<string, unknown> = {}
  if (lastAssistantMessage) {
    const metadata = lastAssistantMessage.metadata as Record<string, unknown> | undefined
    if (metadata?.usage) {
      Object.assign(tokenUsage, metadata.usage as Record<string, unknown>)
    }
    if (typeof lastAssistantMessage.inputTokens === "number") {
      tokenUsage.inputTokens = lastAssistantMessage.inputTokens
    }
    if (typeof lastAssistantMessage.outputTokens === "number") {
      tokenUsage.outputTokens = lastAssistantMessage.outputTokens
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
