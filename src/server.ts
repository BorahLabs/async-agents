import express from "express"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { initDb, closeDb } from "./db/index.js"
import { authMiddleware } from "./middleware/auth.js"
import { QueueManager } from "./queue/manager.js"
import { createHealthRouter } from "./routes/health.js"
import sessionsRouter from "./routes/sessions.js"
import filesRouter from "./routes/files.js"
import gitRouter from "./routes/git.js"
import providersRouter from "./routes/admin/providers.js"
import mcpRouter from "./routes/admin/mcp.js"
import skillsRouter from "./routes/admin/skills.js"
import settingsRouter from "./routes/admin/settings.js"
import apiKeysRouter from "./routes/admin/apiKeys.js"
import { createDashboardRouter } from "./routes/admin/dashboard.js"
import githubRouter from "./routes/admin/github.js"
import { countQueuedMessages } from "./db/queries/messages.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = parseInt(process.env.PORT ?? "3000", 10)

// Initialize database
initDb()

// Queue manager
const queueManager = new QueueManager()

function getQueueStats() {
  return {
    active: queueManager.activeWorkerCount,
    max: queueManager.maxWorkers,
    queueLength: countQueuedMessages(),
  }
}

// Middleware
app.use(express.json())
app.use(authMiddleware)

// Public API routes
app.use("/api/health", createHealthRouter(getQueueStats))
app.use("/api/sessions", sessionsRouter)
app.use("/api/files", filesRouter)
app.use("/api/git", gitRouter)

// Admin API routes (no auth — handled by middleware skip)
app.use("/api/admin/providers", providersRouter)
app.use("/api/admin/mcp-servers", mcpRouter)
app.use("/api/admin/skills", skillsRouter)
app.use("/api/admin/settings", settingsRouter)
app.use("/api/admin/api-keys", apiKeysRouter)
app.use("/api/admin/dashboard", createDashboardRouter(getQueueStats))
app.use("/api/admin/github", githubRouter)

// Serve admin panel static files
const adminPath = path.join(__dirname, "admin")
app.use(express.static(adminPath))
app.get(/^\/(?!api\/).*/, (_req, res) => {
  res.sendFile(path.join(adminPath, "index.html"))
})

// Start server
const server = app.listen(PORT, () => {
  console.log(`async-agents API listening on port ${PORT}`)
})

// Start queue workers
queueManager.start().catch((err) => {
  console.error("Failed to start queue manager:", err)
})

// Graceful shutdown
function shutdown() {
  console.log("Shutting down...")
  queueManager
    .stop()
    .then(() => {
      closeDb()
      server.close(() => {
        console.log("Server closed")
        process.exit(0)
      })
    })
    .catch((err) => {
      console.error("Error during shutdown:", err)
      process.exit(1)
    })
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
