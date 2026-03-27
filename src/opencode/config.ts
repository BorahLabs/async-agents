export interface McpServerInput {
  name: string
  type: string
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

interface StdioMcpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
}

interface SseMcpServerConfig {
  url: string
  env?: Record<string, string>
}

type McpServerConfig = StdioMcpServerConfig | SseMcpServerConfig

interface AgentConfig {
  systemPrompt: string
  tools?: string[]
  model?: string
  type?: string
}

/**
 * Parse a command string into command + args.
 * The first whitespace-delimited token is the command, the rest are args.
 */
function parseCommand(commandString: string): { command: string; args: string[] } {
  const trimmed = commandString.trim()
  if (!trimmed) {
    return { command: "", args: [] }
  }

  const tokens = trimmed.split(/\s+/)
  return {
    command: tokens[0],
    args: tokens.slice(1),
  }
}

/**
 * Parse a JSON string of environment variables into a plain object.
 * Returns an empty object if the string is null, undefined, empty, or invalid JSON.
 */
function parseEnvVars(envVarsJson: string | undefined | null): Record<string, string> {
  if (!envVarsJson || !envVarsJson.trim()) {
    return {}
  }

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
 * Parse an allowed_tools JSON string into a string array.
 * Returns undefined if the string is null, undefined, empty, or invalid JSON.
 */
function parseAllowedTools(allowedToolsJson: string | undefined | null): string[] | undefined {
  if (!allowedToolsJson || !allowedToolsJson.trim()) {
    return undefined
  }

  try {
    const parsed = JSON.parse(allowedToolsJson) as unknown
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string")
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Generate an opencode.json config object for a session.
 *
 * Returns an object matching the opencode.json schema with provider, model,
 * MCP server, and agent (skill) configuration.
 */
export function generateSessionConfig(params: SessionConfigParams): Record<string, unknown> {
  const config: Record<string, unknown> = {}

  // Provider and model configuration
  config.provider = {
    [params.provider]: {
      models: {
        [params.model]: {},
      },
    },
  }

  // MCP servers configuration
  if (params.mcpServers && params.mcpServers.length > 0) {
    const mcpServers: Record<string, McpServerConfig> = {}

    for (const server of params.mcpServers) {
      const env = parseEnvVars(server.env_vars)
      const hasEnv = Object.keys(env).length > 0

      if (server.type === "stdio" && server.command) {
        const { command, args } = parseCommand(server.command)
        if (command) {
          const serverConfig: StdioMcpServerConfig = { command, args }
          if (hasEnv) {
            serverConfig.env = env
          }
          mcpServers[server.name] = serverConfig
        }
      } else if (server.type === "sse" && server.url) {
        const serverConfig: SseMcpServerConfig = { url: server.url }
        if (hasEnv) {
          serverConfig.env = env
        }
        mcpServers[server.name] = serverConfig
      }
    }

    if (Object.keys(mcpServers).length > 0) {
      config.mcpServers = mcpServers
    }
  }

  // Agent (skill) configuration
  if (params.skills && params.skills.length > 0) {
    const agents: Record<string, AgentConfig> = {}

    for (const skill of params.skills) {
      const agentConfig: AgentConfig = {
        systemPrompt: skill.system_prompt,
      }

      const tools = parseAllowedTools(skill.allowed_tools)
      if (tools && tools.length > 0) {
        agentConfig.tools = tools
      }

      // Build model string in "provider/model" format if both are provided
      if (skill.model_provider && skill.model_id) {
        agentConfig.model = `${skill.model_provider}/${skill.model_id}`
      } else if (skill.model_id) {
        // Fall back to just model ID if no provider specified
        agentConfig.model = skill.model_id
      }

      agents[skill.name] = agentConfig
    }

    if (Object.keys(agents).length > 0) {
      config.agents = agents
    }
  }

  return config
}
