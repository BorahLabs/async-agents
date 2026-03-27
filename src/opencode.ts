import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk"
import type { OpencodeClient } from "@opencode-ai/sdk"

export interface AgentConfig {
  model?: { providerID: string; modelID: string }
  agent?: string
  system?: string
  tools?: Record<string, boolean>
}

let instance: { client: OpencodeClient; ready: boolean } | null = null

export async function getClient() {
  if (instance?.ready) return instance.client

  const { client } = await createOpencode({
    hostname: "127.0.0.1",
    port: 4096,
  })

  instance = { client, ready: true }
  return client
}

export async function connectToExisting(baseUrl: string) {
  const client = createOpencodeClient({ baseUrl })
  instance = { client, ready: true }
  return client
}

export async function createSession(title?: string) {
  const client = await getClient()
  return client.session.create({ body: { title: title ?? "async-agent" } })
}

export async function listSessions() {
  const client = await getClient()
  return client.session.list()
}

export async function getSession(id: string) {
  const client = await getClient()
  return client.session.get({ path: { id } })
}

export async function sendPrompt(sessionId: string, text: string, config?: AgentConfig) {
  const client = await getClient()
  return client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text }],
      ...(config?.model && { model: config.model }),
      ...(config?.agent && { agent: config.agent }),
      ...(config?.system && { system: config.system }),
      ...(config?.tools && { tools: config.tools }),
    },
  })
}

export async function injectContext(sessionId: string, text: string) {
  const client = await getClient()
  return client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: "text", text }],
      noReply: true,
    },
  })
}

export async function abortSession(sessionId: string) {
  const client = await getClient()
  return client.session.abort({ path: { id: sessionId } })
}

export async function listMessages(sessionId: string) {
  const client = await getClient()
  return client.session.messages({ path: { id: sessionId } })
}

export async function getMessage(sessionId: string, messageId: string) {
  const client = await getClient()
  return client.session.message({ path: { id: sessionId, messageID: messageId } })
}

export async function subscribeEvents(): Promise<unknown> {
  const client = await getClient()
  return client.event.subscribe()
}

export async function listAgents() {
  const client = await getClient()
  return client.app.agents()
}

export async function mcpStatus() {
  const client = await getClient()
  return client.mcp.status()
}
