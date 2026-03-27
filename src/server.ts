import express from "express"
import {
  createSession,
  listSessions,
  getSession,
  sendPrompt,
  injectContext,
  abortSession,
  listMessages,
  getMessage,
  listAgents,
  mcpStatus,
  getClient,
  connectToExisting,
} from "./opencode.js"
import type { AgentConfig } from "./opencode.js"

const app = express()
app.use(express.json())

const PORT = parseInt(process.env.PORT ?? "3000", 10)

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

// Initialize OpenCode -- starts a new server
app.post("/opencode/init", async (_req, res) => {
  try {
    await getClient()
    res.json({ connected: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Connect to an existing OpenCode server
app.post("/opencode/connect", async (req, res) => {
  try {
    const { baseUrl } = req.body
    if (!baseUrl) {
      res.status(400).json({ error: "baseUrl is required" })
      return
    }
    await connectToExisting(baseUrl)
    res.json({ connected: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// List sessions
app.get("/sessions", async (_req, res) => {
  try {
    const sessions = await listSessions()
    res.json(sessions)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Create session
app.post("/sessions", async (req, res) => {
  try {
    const { title } = req.body ?? {}
    const session = await createSession(title)
    res.status(201).json(session)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get session
app.get("/sessions/:id", async (req, res) => {
  try {
    const session = await getSession(req.params.id)
    res.json(session)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Send prompt to session
app.post("/sessions/:id/prompt", async (req, res) => {
  try {
    const { text, model, agent, system, tools } = req.body
    if (!text) {
      res.status(400).json({ error: "text is required" })
      return
    }
    const config: AgentConfig = {}
    if (model) config.model = model
    if (agent) config.agent = agent
    if (system) config.system = system
    if (tools) config.tools = tools

    const response = await sendPrompt(req.params.id, text, config)
    res.json(response)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Inject context without triggering a response
app.post("/sessions/:id/context", async (req, res) => {
  try {
    const { text } = req.body
    if (!text) {
      res.status(400).json({ error: "text is required" })
      return
    }
    await injectContext(req.params.id, text)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Abort session
app.post("/sessions/:id/abort", async (req, res) => {
  try {
    await abortSession(req.params.id)
    res.json({ aborted: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// List messages in a session
app.get("/sessions/:id/messages", async (req, res) => {
  try {
    const messages = await listMessages(req.params.id)
    res.json(messages)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get a specific message
app.get("/sessions/:id/messages/:messageId", async (req, res) => {
  try {
    const message = await getMessage(req.params.id, req.params.messageId)
    res.json(message)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// List available agents
app.get("/agents", async (_req, res) => {
  try {
    const agents = await listAgents()
    res.json(agents)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Get MCP server status
app.get("/mcp/status", async (_req, res) => {
  try {
    const status = await mcpStatus()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.listen(PORT, () => {
  console.log(`async-agents API listening on port ${PORT}`)
})
