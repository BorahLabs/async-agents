# OpenCode SDK Research

> Research document for the `async-agents` project.
> Evaluates the OpenCode SDK (`@opencode-ai/sdk`) as a foundation for building background AI agents with per-session MCP and configurable agent skills.

---

## Table of Contents

1. [What is OpenCode?](#1-what-is-opencode)
2. [SDK Overview](#2-sdk-overview)
3. [SDK API Reference](#3-sdk-api-reference)
4. [Agents System](#4-agents-system)
5. [Plugin System](#5-plugin-system)
6. [MCP Integration & Per-Session Configuration](#6-mcp-integration--per-session-configuration)
7. [Background / Async Agent Patterns](#7-background--async-agent-patterns)
8. [Use Cases for async-agents](#8-use-cases-for-async-agents)
9. [Feasibility Assessment](#9-feasibility-assessment)
10. [Sources](#10-sources)

---

## 1. What is OpenCode?

OpenCode is an open-source AI coding agent with 95K+ GitHub stars and ~2.5 million monthly developers. It provides a terminal-based TUI, desktop app, and IDE extensions for AI-assisted coding.

### History

- Originally built in **Go** by the Charm team (Bubble Tea TUI framework).
- The original repo was **archived in September 2025** and continued as [Charmbracelet Crush](https://github.com/charmbracelet/crush).
- A fork at [sst/opencode](https://github.com/sst/opencode) (now [anomalyco/opencode](https://github.com/anomalyco/opencode)) continued development and became the current **opencode.ai** project.
- As of March 2026, the project is actively maintained with a full SDK, plugin system, and agent framework.

### Architecture

| Component | Technology | Role |
|-----------|-----------|------|
| Core Server | Go | API server, session management, LLM orchestration |
| TUI | Bubble Tea (Go) | Terminal user interface |
| Data Layer | SQLite | Persistent storage for sessions/conversations |
| SDK | TypeScript (`@opencode-ai/sdk`) | Programmatic client for the server |
| Plugin System | TypeScript (`@opencode-ai/plugin`) | Extensibility via hooks, tools, and events |

### Provider Support

OpenCode uses the Vercel AI SDK and Models.dev to support **75+ LLM providers**, including:
OpenAI, Anthropic Claude, Google Gemini, AWS Bedrock, Groq, Azure OpenAI, OpenRouter, and local models via Ollama.

---

## 2. SDK Overview

The `@opencode-ai/sdk` package (latest: **v1.3.2**, npm) provides a type-safe TypeScript client for the OpenCode server. All types are **auto-generated from an OpenAPI specification**.

### Installation

```bash
npm install @opencode-ai/sdk
```

### Two Modes of Operation

**1. Full mode** -- starts both a server and client:

```typescript
import { createOpencode } from "@opencode-ai/sdk"

const { client, server } = await createOpencode({
  hostname: "127.0.0.1",
  port: 4096,
  timeout: 5000,
  config: {
    model: "anthropic/claude-opus-4-6"
  }
})
```

The instance picks up your `opencode.json` but inline config overrides are supported.

**2. Client-only mode** -- connects to an existing server:

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({
  baseUrl: "http://localhost:4096"
})
```

### TypeScript Support

TypeScript >= 4.9. All types generated from OpenAPI spec:

```typescript
import type { Session, Message, Part } from "@opencode-ai/sdk"
```

---

## 3. SDK API Reference

The client exposes the following API namespaces:

### 3.1 Session Management

| Method | Description |
|--------|-------------|
| `client.session.list()` | List all sessions |
| `client.session.get({ path: { id } })` | Get a specific session |
| `client.session.create({ body: { title } })` | Create a new session |
| `client.session.chat(...)` | Send a chat message (alias for prompt) |
| `client.session.prompt(...)` | Send a prompt to a session |
| `client.session.abort(...)` | Abort a running session |
| `client.session.fork(...)` | Fork a session (branching) |

#### Creating a session

```typescript
const session = await client.session.create({
  body: { title: "Refactor utils" }
})
```

#### Sending a prompt

```typescript
const response = await client.session.prompt({
  path: { id: session.data.id },
  body: {
    parts: [{ type: "text", text: "Refactor the utils module to use ES modules" }]
  }
})
```

#### Injecting context without triggering a response

```typescript
await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Context: the project uses pnpm workspaces" }],
    noReply: true
  }
})
```

### 3.2 Message Management

| Method | Description |
|--------|-------------|
| `client.message.list({ path: { id } })` | List messages in a session |
| `client.message.get({ path: { sessionId, id } })` | Get a specific message |

### 3.3 Event Subscription (SSE)

Real-time Server-Sent Events for monitoring system state. The SDK supports **30+ event types**.

```typescript
const eventStream = await client.event.subscribe()

for await (const event of eventStream) {
  console.log("Event:", event.type)

  switch (event.type) {
    case "session.idle":
      console.log("Session completed:", event.properties.sessionID)
      break
    case "message.updated":
      // Process streamed message updates
      break
    case "tool.execute":
      // Monitor tool execution
      break
  }
}
```

Key event types include:
- `session.created`, `session.updated`, `session.idle`
- `message.created`, `message.updated`, `message.completed`
- `tool.execute.before`, `tool.execute.after`
- `file.changed`
- `permission.ask`

### 3.4 Configuration

| Method | Description |
|--------|-------------|
| `client.config.get()` | Get current configuration |
| Provider/model listing | List available providers and models |
| MCP configuration | Access MCP server configuration |

### 3.5 Structured Output

Request validated JSON responses using a JSON schema:

```typescript
const response = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: "text", text: "Analyze dependencies in package.json" }],
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          dependencies: { type: "array", items: { type: "string" } },
          outdated: { type: "array", items: { type: "string" } },
          risk: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["dependencies", "outdated", "risk"]
      }
    }
  }
})
```

The model uses a `StructuredOutput` tool internally. If validation fails after retries, a `StructuredOutputError` is returned.

### 3.6 Error Handling

Standard try/catch:

```typescript
try {
  const session = await client.session.create({ body: { title: "test" } })
} catch (error) {
  console.error("SDK error:", error)
}
```

---

## 4. Agents System

OpenCode has a built-in agent abstraction with two tiers:

### 4.1 Primary Agents

Main assistants the user interacts with directly (cycle with `Tab`):

| Agent | Role |
|-------|------|
| **Build** | Code generation and implementation |
| **Plan** | Strategic planning and architecture |

### 4.2 Subagents

Specialized assistants that primary agents invoke for specific tasks. Can also be manually invoked via `@mention`:

| Subagent | Role |
|----------|------|
| **General** | General-purpose assistant |
| **Explore** | Fast codebase search and exploration |

### 4.3 Custom Agents

Agents are configurable with custom prompts, models, and tool access. Configuration is done via `opencode.json`:

```jsonc
{
  "agents": {
    "my-reviewer": {
      "model": "anthropic/claude-opus-4-6",
      "systemPrompt": "You are a code reviewer. Focus on security, performance, and correctness.",
      "tools": ["read", "grep", "glob"],
      "type": "subagent"
    }
  }
}
```

Agents can be scoped to specific tools, restricting what actions they can take (e.g., read-only agents for review tasks vs. write-capable agents for implementation).

---

## 5. Plugin System

The plugin system (`@opencode-ai/plugin`) is OpenCode's primary extensibility mechanism. Plugins are TypeScript modules that can add custom tools, hooks, authentication providers, and event handlers.

### 5.1 Plugin Structure

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const MyPlugin: Plugin = async ({ client, project, $, directory, worktree }) => {
  return {
    tool: { /* custom tools */ },
    auth: { /* authentication providers */ },
    event: { /* event handlers */ },
    config: { /* configuration options */ },
    hooks: { /* lifecycle hooks */ }
  }
}
```

**Important:** The plugin function receives a **context object** -- destructure what you need.

### 5.2 Plugin Context (`PluginInput`)

| Property | Type | Description |
|----------|------|-------------|
| `client` | SDK Client | Full OpenCode SDK client (localhost:4096) |
| `project` | Object | Project ID, worktree location, VCS type |
| `$` | BunShell | Shell execution via Bun |
| `directory` | string | Current working directory |
| `worktree` | string | Project root path |

### 5.3 Custom Tools

Tools are functions the AI agent can call during a session. Define with Zod schemas:

```typescript
import { tool } from "@opencode-ai/plugin"

return {
  tool: {
    "check-deps": tool({
      description: "Check for outdated dependencies",
      args: {
        path: tool.schema.string().describe("Path to package.json")
      },
      async execute(args, context) {
        // context includes sessionID, messageID, agent, abort
        const result = await $`npm outdated --json`.cwd(args.path)
        return JSON.parse(result.stdout)
      }
    })
  }
}
```

Tools are auto-discovered from:
- Global: `~/.config/opencode/plugin/`
- Project: `.opencode/plugin/`

The filename becomes the tool name.

### 5.4 Available Hooks

| Hook | Description |
|------|-------------|
| `event` | Monitor session lifecycle, message updates, tool execution, file changes, permissions |
| `stop` | Intercept agent stop attempts; enforce workflow completion |
| `tool.execute.before` | Modify args or block dangerous commands before execution |
| `tool.execute.after` | React to completed tool operations |
| `chat.message` | Intercept/modify messages before LLM processing |
| `chat.params` | Adjust temperature, topP, custom options |
| `permission.ask` | Control permission requests (allow/deny programmatically) |
| `config` | Add custom configuration options |
| `experimental.session.compacting` | Inject domain context before compaction summary |

### 5.5 Session State Management

Track state across a session using Maps keyed by session ID:

```typescript
const sessionState = new Map<string, { tasksCompleted: number }>()

return {
  hooks: {
    event: (event) => {
      const sessionId = event.session_id || event.sessionID
      if (!sessionState.has(sessionId)) {
        sessionState.set(sessionId, { tasksCompleted: 0 })
      }
    }
  }
}
```

### 5.6 Plugin Registration

In `opencode.json`:

```json
{
  "plugin": [
    "opencode-my-plugin",
    "@my-org/custom-plugin",
    "file:///path/to/local/plugin"
  ]
}
```

Dependencies are auto-installed via Bun at startup and cached in `~/.cache/opencode/node_modules/`.

### 5.7 Authentication Providers

Plugins can add OAuth and API key auth:

```typescript
auth: {
  provider: "myservice",
  methods: [{
    type: "oauth",
    label: "Connect Service",
    authorize: async () => ({ /* OAuth config */ })
  }]
}
```

---

## 6. MCP Integration & Per-Session Configuration

### 6.1 MCP in OpenCode

OpenCode supports MCP (Model Context Protocol) servers as a first-class concept. MCP servers can be configured globally or per-project in `opencode.json`:

```jsonc
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    }
  }
}
```

### 6.2 Per-Session MCP via Plugins

The plugin system enables dynamic MCP configuration per session. Since plugins have access to the full SDK client and can intercept events, you can:

1. **Spin up MCP servers on demand** using the Bun shell (`$`) in plugin context
2. **Scope MCP servers to specific tasks** by starting/stopping them in event hooks
3. **Configure per-agent MCP access** by combining agent tool restrictions with MCP tool exposure

### 6.3 Skill-Embedded MCPs (oh-my-opencode pattern)

The community plugin `oh-my-opencode` pioneered **skill-embedded MCPs**:

- Skills bring their own MCP servers
- Servers spin up on-demand, scoped to the task
- Automatically shut down when done
- Context window stays clean (no global MCP bloat)

This pattern is ideal for async-agents where different tasks need different tool capabilities.

### 6.4 Programmatic MCP Configuration

Using the SDK, you can configure MCP servers when creating an OpenCode instance:

```typescript
const { client } = await createOpencode({
  config: {
    mcpServers: {
      "task-specific-server": {
        command: "npx",
        args: ["-y", "@my-org/mcp-server-jira"],
        env: { JIRA_TOKEN: process.env.JIRA_TOKEN }
      }
    }
  }
})
```

This allows each background agent instance to have its own MCP configuration tailored to its task.

---

## 7. Background / Async Agent Patterns

### 7.1 Native SDK Approach

The SDK's `createOpencode()` starts its own server instance. This means you can spawn **multiple independent OpenCode instances**, each with its own:
- Session
- Configuration (model, provider, MCP servers)
- Tool access
- Working directory

```typescript
import { createOpencode } from "@opencode-ai/sdk"

async function spawnBackgroundAgent(task: string, mcpConfig: Record<string, any>) {
  const { client } = await createOpencode({
    config: {
      model: "anthropic/claude-sonnet-4-6",
      mcpServers: mcpConfig
    }
  })

  const session = await client.session.create({
    body: { title: `Background: ${task}` }
  })

  const response = await client.session.prompt({
    path: { id: session.data.id },
    body: {
      parts: [{ type: "text", text: task }]
    }
  })

  return response
}
```

### 7.2 Community: opencode-background-agents

The [`opencode-background-agents`](https://github.com/kdcokenny/opencode-background-agents) plugin provides a battle-tested delegation model:

**Three-phase workflow:**
1. `delegate(prompt, agent)` -- launches background research in an isolated session
2. Main conversation continues uninterrupted
3. `delegation_read(id)` -- retrieves distilled results when ready

**Key properties:**
- Results persist to `~/.local/share/opencode/delegations/` as markdown files
- Survives context compaction, session restarts, and process crashes
- 15-minute timeout per delegation
- **Read-only agents only** (researcher, explore) -- write-capable agents must use the native `task` tool

**API:**

| Tool | Function |
|------|----------|
| `delegate(prompt, agent)` | Launch background research task |
| `delegation_read(id)` | Retrieve specific delegation result |
| `delegation_list()` | List all delegations with titles/summaries |

### 7.3 Community: oh-my-opencode

[`oh-my-opencode`](https://github.com/code-yeongyu/oh-my-opencode) takes a more ambitious approach with multi-agent orchestration:

**Key concepts:**
- **Category-based delegation**: Agents declare task categories (`visual-engineering`, `deep`, `quick`, `ultrabrain`) instead of specific models
- **Parallel execution**: Multiple specialist agents run concurrently with configurable concurrency limits per provider/model
- **Specialist agents**: Sisyphus (orchestrator), Hephaestus (deep worker), Prometheus (planner), Oracle (architecture), Librarian (docs), Explore (search)
- **Hash-anchored edits (Hashline)**: Each line carries a content hash, preventing edit corruption when multiple agents work concurrently
- **Skill-embedded MCPs**: MCP servers scoped to specific skills, spun up on-demand

### 7.4 OpenCode Zen API

OpenCode Zen is a headless API mode that other coding agents can use as a provider. This is relevant for async-agents because it means OpenCode can act as a **backend service** that other systems call into, not just a TUI application.

---

## 8. Use Cases for async-agents

### 8.1 Scheduled Code Tasks

Using the SDK + a scheduler (cron, node-cron, Bull, etc.):

```typescript
import { createOpencode } from "@opencode-ai/sdk"
import { CronJob } from "cron"

// Weekly dependency audit
new CronJob("0 9 * * 1", async () => {
  const { client } = await createOpencode({
    config: { model: "anthropic/claude-sonnet-4-6" }
  })

  const session = await client.session.create({
    body: { title: "Weekly Dependency Audit" }
  })

  await client.session.prompt({
    path: { id: session.data.id },
    body: {
      parts: [{
        type: "text",
        text: "Audit all dependencies. Check for outdated packages, known vulnerabilities, and unused dependencies. Create a report."
      }]
    }
  })
}).start()
```

### 8.2 Per-Session MCP / Agent Skills

Each scheduled task can have its own MCP configuration:

```typescript
// Jira cleanup agent -- has Jira MCP
await spawnAgent("Close stale tickets older than 30 days", {
  mcpServers: { jira: { command: "npx", args: ["-y", "mcp-server-jira"] } }
})

// DB migration reviewer -- has Postgres MCP
await spawnAgent("Review pending migrations for safety issues", {
  mcpServers: { postgres: { command: "npx", args: ["-y", "mcp-server-postgres"] } }
})

// Code quality agent -- has GitHub MCP
await spawnAgent("Run linting report and file issues for violations", {
  mcpServers: { github: { command: "npx", args: ["-y", "mcp-server-github"] } }
})
```

### 8.3 Refactoring Agents

```typescript
const { client } = await createOpencode({
  config: {
    model: "anthropic/claude-opus-4-6",
    mcpServers: {
      // LSP server for type-aware refactoring
      typescript: { command: "npx", args: ["-y", "mcp-server-typescript"] }
    }
  }
})

await client.session.prompt({
  path: { id: session.data.id },
  body: {
    parts: [{
      type: "text",
      text: "Migrate all files in src/utils/ from CommonJS to ES modules. Preserve all exports and update all import sites."
    }]
  }
})
```

---

## 9. Feasibility Assessment

### Strengths

| Aspect | Assessment |
|--------|-----------|
| **SDK maturity** | v1.3.2, 360+ dependents on npm, auto-generated from OpenAPI -- solid foundation |
| **TypeScript-first** | Full type safety, aligns with our tech stack |
| **Multi-provider** | 75+ providers means no vendor lock-in |
| **Plugin system** | Rich hook/tool/event system for customization |
| **MCP support** | First-class MCP means per-session tool configuration is straightforward |
| **Session isolation** | Each `createOpencode()` call creates an independent instance |
| **Community ecosystem** | Active plugins for background agents, multi-agent orchestration |
| **Structured output** | JSON schema validation built in -- useful for agent-to-agent communication |

### Weaknesses / Risks

| Aspect | Assessment |
|--------|-----------|
| **Server overhead** | Each `createOpencode()` spawns a Go server process -- resource-heavy for many concurrent agents |
| **Fork history** | Project has complex fork history (original Charm -> Crush -> sst/opencode -> anomalyco/opencode) which could affect long-term stability |
| **Documentation gaps** | Docs site blocks automated access; some APIs are under-documented |
| **Plugin stability** | Known issues with `@opencode-ai/plugin` module resolution and version mismatches on upgrade |
| **No native scheduler** | Background/scheduled execution requires external orchestration |
| **Write safety** | No built-in guard rails for concurrent write agents operating on the same codebase |
| **15-min timeout** | Background delegation plugin has a hard 15-minute cap |

### Verdict

The OpenCode SDK is a **viable foundation** for building async background agents. Its strengths (TypeScript SDK, MCP support, plugin system, multi-provider) align well with the async-agents requirements. The main challenges are:

1. **Process overhead** -- need an architecture that manages server lifecycle efficiently (connection pooling, shared servers via `createOpencodeClient`)
2. **Concurrency safety** -- need git worktree isolation or file locking for write agents
3. **Scheduling** -- must be built externally (node-cron, Bull, cloud scheduler)

**Recommended approach**: Use `createOpencode()` for isolated agent instances with per-session MCP, combined with an external task scheduler and git worktree isolation for write operations.

---

## 10. Sources

- [OpenCode Official Site](https://opencode.ai/)
- [OpenCode SDK Docs](https://opencode.ai/docs/sdk/)
- [OpenCode Agents Docs](https://opencode.ai/docs/agents/)
- [OpenCode Plugins Docs](https://opencode.ai/docs/plugins/)
- [OpenCode Custom Tools](https://opencode.ai/docs/custom-tools/)
- [@opencode-ai/sdk on npm](https://www.npmjs.com/package/@opencode-ai/sdk)
- [OpenCode GitHub (anomalyco)](https://github.com/anomalyco/opencode)
- [Charmbracelet Crush](https://github.com/charmbracelet/crush)
- [opencode-background-agents](https://github.com/kdcokenny/opencode-background-agents)
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- [Vercel AI SDK Provider for OpenCode](https://github.com/ben-vargas/ai-sdk-provider-opencode-sdk)
- [OpenCode Plugin Guide (Gist)](https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a)
- [OpenCode Plugin Development Guide (Gist)](https://gist.github.com/rstacruz/946d02757525c9a0f49b25e316fbe715)
