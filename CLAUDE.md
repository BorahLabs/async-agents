# async-agents

## Tech Stack

- TypeScript / Node.js
- SQLite (better-sqlite3) for persistence
- Express 5 for API
- React + Vite for admin panel
- OpenCode SDK (`@opencode-ai/sdk`) v1.3.2+ for agent orchestration
- Docker for deployment

## References

- Before writing any code that integrates with or uses the OpenCode SDK (`@opencode-ai/sdk`, `@opencode-ai/plugin`, or OpenCode agents/plugins), read `research/opencode-sdk.md` first. It contains the full API reference, plugin system docs, MCP configuration patterns, and background agent architecture decisions.
- `SPEC.md` has the full technical specification for the platform.
- `openapi.yaml` has the complete API spec (importable into Postman/Insomnia).

## OpenCode SDK Key Findings

These were discovered through hands-on debugging and are NOT in the official docs:

### MCP Server Configuration (OpenCode 1.3.3)
- The config key is `"mcp"` (NOT `"mcpServers"`)
- Server type for stdio is `"local"` (NOT `"stdio"`)
- Server type for SSE is `"remote"` (NOT `"sse"`)
- Command must be an array: `"command": ["npx", "-y", "package"]` (NOT string)
- MCP config is a **project-level** setting (in `opencode.json` at git repo root), NOT a global setting (`~/.config/opencode/opencode.json` rejects `mcp`/`mcpServers` keys)
- The project directory MUST be a git repo (`git init`) for OpenCode to discover project config

### Skills
- Skills are filesystem-based at `~/.config/opencode/skills/<name>/SKILL.md`
- Each skill needs a directory named after it, containing a `SKILL.md` file with YAML frontmatter (`name`, `description`) and the system prompt as the markdown body
- OpenCode agents discover skills automatically and load them via the built-in `skill()` tool
- Skills work from the global path regardless of the project directory
- We store skills directly on disk (not in DB) — the filesystem is the source of truth

### Provider API Keys
- Provider API keys are injected as environment variables (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)
- The Go process inherits env vars from the Node process, so `process.env` must be set BEFORE calling `createOpencode()`
- API key env var names: anthropic→`ANTHROPIC_API_KEY`, openai→`OPENAI_API_KEY`, google-generative-ai→`GOOGLE_GENERATIVE_AI_API_KEY`, groq→`GROQ_API_KEY`, deepseek→`DEEPSEEK_API_KEY`, openrouter→`OPENROUTER_API_KEY`, mistral→`MISTRAL_API_KEY`, xai→`XAI_API_KEY`

### SDK Prompt Behavior
- `client.session.prompt()` returns the assistant response in `.data` with `{ info, parts }`
- `.data.parts[]` contains `{ type: "text", text: "..." }` for text and `{ type: "tool-invocation" }` for tool calls
- `.data.info.tokens` contains `{ total, input, output, reasoning, cache: { read, write } }`
- If the model ID is invalid, `prompt()` returns `{ data: {} }` silently — no error thrown
- Messages fetched via `client.session.messages()` do NOT have a `.role` field directly — it's in `.info.role`
- `client.session.chat()` does NOT exist — use `client.session.prompt()`
- `client.message.list()` does NOT exist — use `client.session.messages()`

### Session API (Express)
- The session creation endpoint accepts both camelCase and snake_case field names (e.g., `mcpServers` and `mcp_servers`)

## Architecture Notes

- Workers are persistent OpenCode instances (one Go process per worker)
- When a session needs MCP servers, the worker spawns a NEW OpenCode instance on a different port, pointed at a project directory containing the MCP config
- Skills live on disk and are discovered globally — no per-session config needed
- Timeout for agent prompts is 4 hours (agents can do complex multi-step work)
- The `opencode-config` Docker volume persists `~/.config/opencode/` (skills survive rebuilds)
