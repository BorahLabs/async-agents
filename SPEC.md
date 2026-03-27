# Async Agents — Technical Specification

> **Version:** 1.0
> **Date:** 2026-03-27
> **Status:** Draft

## 1. Overview

Async Agents is a Docker-based platform for managing OpenCode AI agents via REST API. It enables any platform within the agency to remotely spin up coding/task agents, upload files, clone repositories, send prompts, and retrieve results — all orchestrated through a queue system with configurable concurrency.

The system consists of three parts:
1. **REST API** — for programmatic agent management (sessions, files, prompts, retrieval)
2. **Admin Panel** — React SPA for monitoring sessions, configuring providers/MCP/skills, and viewing usage dashboards
3. **Queue Workers** — in-process workers that execute agent messages against OpenCode instances with concurrency control

All data is persisted in SQLite on a Docker volume.

---

## 2. Architecture

### 2.1 Process Model

API server and queue workers run in the **same Node.js process**. This simplifies deployment (single container), eliminates IPC overhead, and makes SQLite access straightforward (single writer).

```
┌─────────────────────────────────────────────────────┐
│  Docker Container                                    │
│                                                      │
│  ┌──────────────┐   ┌────────────────────────────┐  │
│  │  Express API  │   │   Queue Workers (N)         │  │
│  │  + Static SPA │   │   Each owns a persistent    │  │
│  │               │◄──┤   OpenCode Go process       │  │
│  └──────┬───────┘   └────────────┬───────────────┘  │
│         │                        │                   │
│         ▼                        ▼                   │
│  ┌─────────────────────────────────────────────┐    │
│  │            SQLite Database                    │    │
│  │        (on persistent volume)                 │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           /data/ volume (files, repos)        │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.2 Worker Lifecycle

Each worker maintains a **persistent OpenCode instance** (Go process). Workers are long-lived — they start when the application boots and persist until shutdown. When the admin panel changes the concurrency setting:

- **Scaling up:** New workers are spawned immediately with their own OpenCode instances.
- **Scaling down:** Excess workers finish their current message, then shut down gracefully. No in-progress work is killed.

### 2.3 Crash Recovery

On application startup, any messages in `processing` state (from a previous crash/restart) are **re-queued** with their retry count preserved.

---

## 3. Authentication

### 3.1 API Keys

All API endpoints (except the admin panel static files) require authentication via API key in the `Authorization` header:

```
Authorization: Bearer <api-key>
```

API keys are managed in the admin panel. Each key has:
- **Label** — human-readable name (e.g. `website-bot`, `ci-pipeline`, `n8n-workflow`)
- **Key** — generated random string
- **Created at** — timestamp
- **Last used** — timestamp (updated on each request)
- **Active** — boolean (can be disabled without deleting)

The admin panel itself does **not** require authentication (VPN-only access).

---

## 4. REST API

Base URL: `http://<host>:3000/api`

### 4.1 Sessions

#### `POST /api/sessions`

Create a new session. Returns immediately with a session ID.

**Request body:**
```json
{
  "provider": "openrouter",
  "model": "anthropic/claude-sonnet-4-20250514",
  "systemPrompt": "You are a code reviewer...",
  "workingDirectory": "task-1",
  "mcpServers": ["github", "filesystem"],
  "skills": ["code-review"],
  "title": "Review PR #42"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `provider` | Yes | Provider identifier (must be configured in admin panel) |
| `model` | Yes | Model identifier for the provider |
| `systemPrompt` | No | System prompt persisted for all messages in this session |
| `workingDirectory` | No | Folder name under `/data/` (one level only, validated: no `/`, `..`, or `.`). If omitted, a unique directory is created. |
| `mcpServers` | No | Array of MCP server names (as registered in admin panel). Session gets **only** these servers — no defaults. |
| `skills` | No | Array of skill names (as registered in admin panel) |
| `title` | No | Human-readable session title for admin panel display |

**Validation:**
- Provider must exist in admin panel configuration with valid credentials. **Fails immediately** if not found.
- MCP server names must be registered. Fails if any are unknown.
- Skill names must be registered. Fails if any are unknown.
- `workingDirectory` is validated against path traversal (no `/`, `..`, leading `.`).

**Response:** `201 Created`
```json
{
  "id": "ses_abc123",
  "status": "active",
  "createdAt": "2026-03-27T10:00:00Z"
}
```

#### `GET /api/sessions`

List all sessions with pagination.

**Query params:** `?page=1&limit=50&status=active`

**Response:**
```json
{
  "sessions": [
    {
      "id": "ses_abc123",
      "title": "Review PR #42",
      "status": "active",
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4-20250514",
      "messageCount": 5,
      "createdAt": "2026-03-27T10:00:00Z",
      "lastMessageAt": "2026-03-27T10:05:00Z"
    }
  ],
  "total": 142,
  "page": 1,
  "limit": 50
}
```

#### `GET /api/sessions/:id`

Get full session details including configuration.

#### `GET /api/sessions/:id/messages`

List all messages in a session. Returns the **full message list** (no pagination/cursor — complete history every time).

**Response:**
```json
{
  "messages": [
    {
      "id": "msg_xyz",
      "role": "user",
      "content": "Review this file for security issues",
      "status": "completed",
      "queuedAt": "2026-03-27T10:01:00Z",
      "startedAt": "2026-03-27T10:01:02Z",
      "completedAt": "2026-03-27T10:01:45Z",
      "tokenUsage": { "input": 1500, "output": 800 },
      "retryCount": 0
    },
    {
      "id": "msg_xyz2",
      "role": "assistant",
      "content": "I found 3 security issues...",
      "status": "completed",
      "toolCalls": [...],
      "tokenUsage": { "input": 2000, "output": 1200 },
      "structuredOutput": null
    }
  ]
}
```

### 4.2 Messages / Prompts

#### `POST /api/sessions/:id/messages`

Send a message to a session. The message is **queued** — not processed immediately. Returns the queued message ID for polling.

**Request body:**
```json
{
  "text": "Refactor the auth module to use JWT",
  "structuredOutput": {
    "type": "object",
    "properties": {
      "filesChanged": { "type": "array", "items": { "type": "string" } },
      "summary": { "type": "string" }
    },
    "required": ["filesChanged", "summary"]
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `text` | Yes | The prompt/message text |
| `structuredOutput` | No | JSON Schema (draft-07) for the expected response structure. Passed to OpenCode's StructuredOutput tool. |

**Response:** `202 Accepted`
```json
{
  "id": "msg_xyz",
  "status": "queued",
  "position": 3,
  "queuedAt": "2026-03-27T10:01:00Z"
}
```

**Queue behavior:**
- Messages within a session are **strictly sequential**. A session's next message is only dequeued after the current one completes (or fails permanently).
- Messages across sessions are processed **FIFO** up to the worker concurrency limit. No fairness/priority mechanism.

#### `GET /api/sessions/:id/messages/:messageId`

Get a specific message's current state (useful for polling a queued/processing message).

**Response includes `status`:** `queued` | `processing` | `completed` | `failed`

When `status` is `failed`:
```json
{
  "id": "msg_xyz",
  "status": "failed",
  "error": "Provider rate limit exceeded after 5 retries",
  "retryCount": 5,
  "failedAt": "2026-03-27T10:15:00Z"
}
```

When `status` is `completed` and `structuredOutput` was requested:
```json
{
  "id": "msg_xyz",
  "status": "completed",
  "content": "I've refactored the auth module...",
  "structuredOutput": {
    "filesChanged": ["src/auth.ts", "src/middleware.ts"],
    "summary": "Replaced cookie-based auth with JWT..."
  }
}
```

### 4.3 Files

#### `POST /api/files/:folder`

Upload files to a folder. Folder is auto-created if it doesn't exist. Folder name is validated (one level, no path traversal).

**Request:** `multipart/form-data` with one or more files. Nested paths within the folder can be specified via the `path` field in each part (e.g. `src/index.ts` uploads to `/data/<folder>/src/index.ts`).

**Response:** `200 OK`
```json
{
  "folder": "task-1",
  "files": [
    { "path": "src/index.ts", "size": 1234 },
    { "path": "package.json", "size": 567 }
  ]
}
```

#### `GET /api/files/:folder`

List all files in a folder (recursive).

**Response:**
```json
{
  "folder": "task-1",
  "files": [
    { "path": "src/index.ts", "size": 1234, "modifiedAt": "2026-03-27T10:00:00Z" },
    { "path": "package.json", "size": 567, "modifiedAt": "2026-03-27T10:00:00Z" }
  ]
}
```

#### `GET /api/files/:folder/*path`

Retrieve a single file's contents. Path is relative to the folder.

```
GET /api/files/task-1/src/output/result.json
```

**Response:** Raw file content with appropriate `Content-Type` header.

### 4.4 Git / GitHub

#### `POST /api/git/clone`

Clone a repository into a specific folder using the `gh` CLI.

**Request body:**
```json
{
  "repo": "owner/repo-name",
  "branch": "feature-branch",
  "folder": "task-1"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `repo` | Yes | GitHub repository in `owner/repo` format |
| `branch` | No | Branch to checkout. Defaults to the repo's default branch. |
| `folder` | Yes | Folder name under `/data/` (one level, validated) |

**Response:** `200 OK`
```json
{
  "folder": "task-1",
  "repo": "owner/repo-name",
  "branch": "feature-branch",
  "commitSha": "abc123..."
}
```

Requires the GitHub token to be configured in the admin panel. Returns `400` if token is not set.

### 4.5 Health & Status

#### `GET /api/health`

```json
{
  "status": "ok",
  "workers": { "active": 3, "max": 5, "queueLength": 12 },
  "uptime": 86400
}
```

---

## 5. Queue System

### 5.1 Implementation

The queue is backed by the SQLite `messages` table. No external queue system (Redis, RabbitMQ) — the database is the queue.

**Message states:**
```
queued → processing → completed
                   → failed (after all retries exhausted)
```

### 5.2 Worker Loop

Each worker runs an async loop:

1. Poll the `messages` table for the next `queued` message (FIFO order) where the session has no other message currently `processing`.
2. Mark it as `processing`.
3. Send the prompt to OpenCode via the SDK.
4. On success: store the response, mark as `completed`, record token usage.
5. On failure: increment retry count. If retries < 5, re-queue with delay. Otherwise mark as `failed`.

### 5.3 Retry Policy

- **Max retries:** 5
- **Backoff:** Exponential — 10s, 30s, 90s, 270s, 810s (~20 min total)
- **After exhaustion:** Message is marked `failed` with error details. Session remains `active` — new messages can still be sent and processed.

### 5.4 Concurrency Control

- The admin panel sets `maxConcurrentWorkers` (stored in SQLite `settings` table).
- On boot, the system spawns that many workers.
- When the setting changes, workers are added or drained gracefully.
- Each worker manages one persistent OpenCode Go process.

---

## 6. Admin Panel

React + Vite SPA served as static files by Express. No authentication (VPN-protected). Auto-refreshes via polling every **5 seconds**.

### 6.1 Pages

#### Dashboard
- **Active workers** / max workers / queue length
- **Token usage chart** — tokens consumed per provider over time (day/week/month)
- **Session counts** — total, active, with messages today
- **Recent activity** — last 10 completed/failed messages

#### Sessions List
- Sortable/filterable table of all sessions
- Columns: title, status, provider/model, message count, created, last active
- Click to view session detail

#### Session Detail
- Session configuration (provider, model, system prompt, MCP servers, skills, working directory)
- **Chat-style message view** with:
  - Markdown rendering for message content
  - Syntax-highlighted code blocks
  - Collapsible tool call details
  - Structured output displayed as formatted JSON
  - Message status badges (queued/processing/completed/failed)
  - Token usage per message
  - Timestamps

#### Providers
- List configured providers with their models
- Add/edit/remove provider configurations
- Each provider has: name, type (openai, openrouter, gemini, kimi, anthropic, etc.), base URL (if applicable), API key (masked in UI), enabled models list
- No cost tracking — token counts only

#### MCP Servers
- List registered MCP servers
- Add/edit/remove MCP server configurations
- Each server has:
  - **Name** — unique identifier used in API (e.g. `github`)
  - **Type** — `stdio` or `sse`
  - **Command** (stdio) — e.g. `npx -y @modelcontextprotocol/server-github`
  - **URL** (sse) — e.g. `http://mcp-server:8080/sse`
  - **Environment variables** — key-value pairs (values masked in UI)
  - **Description** — human-readable description

#### Skills
- List registered skills
- Add/edit/remove skill configurations
- Each skill has:
  - **Name** — unique identifier used in API
  - **System prompt** — instructions for the agent when this skill is active
  - **Allowed tools** — list of tool names the agent can use (or "all")
  - **Model preference** — optional provider+model override for this skill
  - **Description** — human-readable description

#### Settings
- **Concurrency** — max concurrent workers (slider/input, 1-20)
- **GitHub Token** — input field (masked) + "Test Connection" button that runs `gh auth status`
- **API Keys** — list, create, enable/disable, delete API keys with labels
- **Retry config** — display current retry policy (read-only for now, hardcoded at 5 retries with exponential backoff)

### 6.2 UI Notes
- No login screen
- Responsive but desktop-first
- Polling indicator ("Last updated: 3s ago")
- Toast notifications for config changes

---

## 7. Database Schema (SQLite)

### `settings`
| Column | Type | Description |
|--------|------|-------------|
| key | TEXT PK | Setting name |
| value | TEXT | JSON-encoded value |
| updated_at | TEXT | ISO timestamp |

Keys: `max_concurrent_workers`, `github_token`

### `api_keys`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| label | TEXT NOT NULL | Human-readable name |
| key_hash | TEXT NOT NULL UNIQUE | SHA-256 hash of the API key |
| key_prefix | TEXT NOT NULL | First 8 chars for display (e.g. `sk_abc1...`) |
| active | INTEGER DEFAULT 1 | 0 or 1 |
| last_used_at | TEXT | ISO timestamp |
| created_at | TEXT NOT NULL | ISO timestamp |

### `providers`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL UNIQUE | e.g. `openrouter` |
| type | TEXT NOT NULL | e.g. `openai`, `openrouter`, `gemini`, `anthropic`, `kimi` |
| base_url | TEXT | Custom base URL (nullable) |
| api_key | TEXT NOT NULL | Encrypted API key |
| models | TEXT | JSON array of enabled model IDs |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

### `mcp_servers`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL UNIQUE | Reference name |
| type | TEXT NOT NULL | `stdio` or `sse` |
| command | TEXT | For stdio servers |
| url | TEXT | For SSE servers |
| env_vars | TEXT | JSON object of env key-value pairs (encrypted) |
| description | TEXT | Human-readable |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

### `skills`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL UNIQUE | Reference name |
| system_prompt | TEXT NOT NULL | Instructions |
| allowed_tools | TEXT | JSON array or `"all"` |
| model_provider | TEXT | Optional override provider |
| model_id | TEXT | Optional override model |
| description | TEXT | Human-readable |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

### `sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | `ses_` + UUID |
| title | TEXT | Human-readable |
| status | TEXT NOT NULL | `active` |
| provider | TEXT NOT NULL | Provider name |
| model | TEXT NOT NULL | Model ID |
| system_prompt | TEXT | Session-level system prompt |
| working_directory | TEXT | Folder name under `/data/` |
| mcp_servers | TEXT | JSON array of MCP server names |
| skills | TEXT | JSON array of skill names |
| opencode_session_id | TEXT | OpenCode SDK's internal session ID |
| created_at | TEXT NOT NULL | ISO timestamp |
| updated_at | TEXT NOT NULL | ISO timestamp |

### `messages`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | `msg_` + UUID |
| session_id | TEXT NOT NULL FK | References sessions.id |
| role | TEXT NOT NULL | `user` or `assistant` |
| content | TEXT | Text content |
| status | TEXT NOT NULL | `queued`, `processing`, `completed`, `failed` |
| structured_output_schema | TEXT | JSON Schema if requested |
| structured_output_result | TEXT | JSON result if completed |
| error | TEXT | Error message if failed |
| retry_count | INTEGER DEFAULT 0 | Current retry count |
| next_retry_at | TEXT | ISO timestamp for next retry |
| position | INTEGER NOT NULL | Queue ordering within session |
| queued_at | TEXT NOT NULL | ISO timestamp |
| started_at | TEXT | ISO timestamp |
| completed_at | TEXT | ISO timestamp |
| failed_at | TEXT | ISO timestamp |

### `tool_calls`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| message_id | TEXT NOT NULL FK | References messages.id (assistant message) |
| tool_name | TEXT NOT NULL | Name of the tool called |
| input | TEXT | JSON input to the tool |
| output | TEXT | JSON output from the tool |
| duration_ms | INTEGER | Execution time |
| created_at | TEXT NOT NULL | ISO timestamp |

### `token_usage`
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| message_id | TEXT NOT NULL FK | References messages.id |
| session_id | TEXT NOT NULL FK | References sessions.id |
| provider | TEXT NOT NULL | Provider name |
| model | TEXT NOT NULL | Model ID |
| raw_usage | TEXT NOT NULL | Full JSON blob from OpenCode SDK (future-proof — stores whatever fields the SDK reports) |
| created_at | TEXT NOT NULL | ISO timestamp |

> **Note:** `raw_usage` stores the complete token metadata object from the OpenCode SDK as-is. This is intentionally not normalized into specific columns (input_tokens, output_tokens, etc.) to remain forward-compatible with whatever token fields providers report (cache tokens, reasoning tokens, etc.). Dashboard queries extract values from this JSON.

---

## 8. Docker Setup

### 8.1 Dockerfile

```dockerfile
FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    curl git \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.local/bin:${PATH}"

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Build backend
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Build admin panel
COPY admin/ ./admin/
RUN cd admin && npm install && npm run build

# Copy built admin panel to be served as static files
RUN cp -r admin/dist ./dist/admin

EXPOSE 3000

# Volumes
VOLUME ["/app/data", "/app/db"]

CMD ["node", "dist/server.js"]
```

### 8.2 docker-compose.yml

```yaml
services:
  async-agents:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - DB_PATH=/app/db/agents.sqlite
      - DATA_PATH=/app/data
    volumes:
      - agents-db:/app/db
      - agents-data:/app/data
      - opencode-data:/root/.local/share/opencode

volumes:
  agents-db:
  agents-data:
  opencode-data:
```

### 8.3 Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `agents-db` | `/app/db` | SQLite database (survives container restarts) |
| `agents-data` | `/app/data` | Uploaded files, cloned repos, agent workspaces |
| `opencode-data` | `/root/.local/share/opencode` | OpenCode internal state |

---

## 9. Project Structure

```
async-agents/
├── src/
│   ├── server.ts              # Express app setup, route mounting, static file serving
│   ├── routes/
│   │   ├── sessions.ts        # Session CRUD + message endpoints
│   │   ├── files.ts           # File upload/list/retrieve
│   │   ├── git.ts             # Clone endpoint
│   │   ├── health.ts          # Health check
│   │   └── admin/
│   │       ├── providers.ts   # Provider CRUD
│   │       ├── mcp.ts         # MCP server CRUD
│   │       ├── skills.ts      # Skill CRUD
│   │       ├── settings.ts    # Settings get/set
│   │       ├── apiKeys.ts     # API key management
│   │       └── dashboard.ts   # Dashboard stats/charts data
│   ├── middleware/
│   │   └── auth.ts            # API key validation middleware
│   ├── queue/
│   │   ├── manager.ts         # Worker pool management, concurrency control
│   │   └── worker.ts          # Individual worker loop + OpenCode instance
│   ├── db/
│   │   ├── index.ts           # SQLite connection (better-sqlite3)
│   │   ├── migrations/        # Schema migration files
│   │   └── queries/           # Typed query functions per table
│   ├── opencode/
│   │   ├── client.ts          # OpenCode SDK wrapper
│   │   └── config.ts          # Dynamic opencode.json generation per session
│   └── utils/
│       ├── validation.ts      # Path validation, schema validation
│       └── crypto.ts          # API key hashing, env var encryption
├── admin/                     # React + Vite SPA
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Sessions.tsx
│   │   │   ├── SessionDetail.tsx
│   │   │   ├── Providers.tsx
│   │   │   ├── McpServers.tsx
│   │   │   ├── Skills.tsx
│   │   │   └── Settings.tsx
│   │   ├── components/
│   │   │   ├── ChatMessage.tsx    # Markdown + code rendering
│   │   │   ├── ToolCallCard.tsx   # Collapsible tool call display
│   │   │   └── ...
│   │   └── hooks/
│   │       └── usePolling.ts      # 5-second polling hook
│   ├── package.json
│   └── vite.config.ts
├── research/
│   └── opencode-sdk.md
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── CLAUDE.md
```

---

## 10. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Queue backend | SQLite (no Redis) | Single process, no external dependencies, persistent by default |
| Worker lifecycle | Persistent OpenCode instances | Avoids 2-5s startup overhead per message. ~100-200MB per worker is acceptable. |
| Message polling | Full message list per request | Simpler client logic. Sessions are bounded in size, so payload stays manageable. |
| Structured output schema | Per-message (JSON Schema draft-07) | Different messages in a workflow need different output shapes. |
| MCP server scope | Only what's specified per session | No hidden defaults. Caller has full explicit control. |
| Session concurrency | Strictly sequential per session | Matches chat-based agent model where each response depends on the previous. |
| Crash recovery | Re-queue in-progress messages | Ensures no work is silently lost after a crash/restart. |
| Frontend | React + Vite SPA | Rich interactivity for chat rendering, dashboards. Served as static files from Express. |
| Token tracking | Store full SDK metadata blob | Future-proof across providers (cache tokens, reasoning tokens, etc.). |
| DB message storage | Fully normalized | Separate tables for messages, tool calls, token usage. Enables rich SQL queries for the dashboard. |
| API auth | Multiple labeled API keys | Track usage per integration source. Keys managed in admin panel. |
| Folder locking | None (caller's risk) | Maximum flexibility. Agency platforms are responsible for avoiding conflicts. |
| Cost tracking | Not included (tokens only) | Simplifies the system. Cost analysis can be done externally from token data. |

---

## 11. API Endpoint Summary

### Public API (requires API key)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + queue status |
| POST | `/api/sessions` | Create a session |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Get session details |
| GET | `/api/sessions/:id/messages` | List all messages (full list) |
| POST | `/api/sessions/:id/messages` | Send a message (queued) |
| GET | `/api/sessions/:id/messages/:msgId` | Get message status/content |
| POST | `/api/files/:folder` | Upload files |
| GET | `/api/files/:folder` | List files in folder |
| GET | `/api/files/:folder/*path` | Retrieve a single file |
| POST | `/api/git/clone` | Clone a repo via `gh` CLI |

### Admin API (no auth — admin panel use only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard` | Dashboard stats |
| GET/POST/PUT/DELETE | `/api/admin/providers` | Provider CRUD |
| GET/POST/PUT/DELETE | `/api/admin/mcp-servers` | MCP server CRUD |
| GET/POST/PUT/DELETE | `/api/admin/skills` | Skill CRUD |
| GET/PUT | `/api/admin/settings` | System settings |
| GET/POST/DELETE | `/api/admin/api-keys` | API key management |
| POST | `/api/admin/github/test` | Test GitHub token |

---

## 12. Non-Functional Requirements

- **No login** — admin panel is open (VPN-protected)
- **No CORS** — server-to-server only
- **No webhooks** — clients poll for results
- **No cost tracking** — token counts only, no dollar amounts
- **No session deletion** — sessions persist forever, admin panel is read-only for session data
- **No folder deletion** — upload folders are never deleted via API (manual cleanup only)
- **Graceful scaling only** — reducing concurrency never kills in-progress work

---

## 13. Open Questions / Future Considerations

These are explicitly **out of scope** for v1 but worth noting:

1. **WebSocket/SSE streaming** — Could replace polling for lower latency. Deferred for simplicity.
2. **Session archival/TTL** — Currently sessions live forever. May need cleanup tooling if DB grows large.
3. **Priority queuing** — FIFO may not be enough if some tasks are time-sensitive. Could add priority levels later.
4. **Webhook callbacks** — Some platforms may prefer push over poll. Easy to add as an optional field on session creation.
5. **Multi-container scaling** — Current single-process model can't scale horizontally. Would need to move queue to Redis/Postgres.
6. **Cost tracking** — Manual price-per-token entry per model in admin panel. Deferred.
