export interface McpServerInput {
  name: string
  type: string // "stdio" or "sse" from our admin panel
  command?: string
  url?: string
  env_vars?: string
}

export interface SkillInput {
  name: string
  system_prompt: string
  allowed_tools?: string
  model_provider?: string
  model_id?: string
}

export interface SessionConfigParams {
  provider: string
  model: string
  mcpServers?: McpServerInput[]
  skills?: SkillInput[]
}

/**
 * Parse a JSON string of environment variables into a plain object.
 */
function parseEnvVars(envVarsJson: string | undefined | null): Record<string, string> {
  if (!envVarsJson || !envVarsJson.trim()) return {}
  try {
    const parsed = JSON.parse(envVarsJson) as unknown
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const result: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        result[key] = String(value)
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Generate an opencode.json config object for a session.
 *
 * OpenCode 1.3.3 expects MCP servers under the "mcp" key with this format:
 *   - Local (stdio): { "type": "local", "command": ["npx", "-y", "package"], "env": {} }
 *   - Remote (SSE): { "type": "remote", "url": "http://..." }
 */
export function generateSessionConfig(params: SessionConfigParams): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  // MCP servers configuration
  if (params.mcpServers && params.mcpServers.length > 0) {
    const mcp: Record<string, unknown> = {}

    for (const server of params.mcpServers) {
      const env = parseEnvVars(server.env_vars)
      const hasEnv = Object.keys(env).length > 0

      if ((server.type === "stdio" || server.type === "local") && server.command) {
        // Parse command string into array: "npx -y package" -> ["npx", "-y", "package"]
        const commandParts = server.command.trim().split(/\s+/)
        const serverConfig: Record<string, unknown> = {
          type: "local",
          command: commandParts,
        }
        if (hasEnv) serverConfig.env = env
        mcp[server.name] = serverConfig
      } else if ((server.type === "sse" || server.type === "remote") && server.url) {
        const serverConfig: Record<string, unknown> = {
          type: "remote",
          url: server.url,
        }
        if (hasEnv) serverConfig.env = env
        mcp[server.name] = serverConfig
      }
    }

    if (Object.keys(mcp).length > 0) {
      config.mcp = mcp
    }
  }

  return config
}
