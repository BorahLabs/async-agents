import { describe, it, expect } from 'vitest';
import { generateSessionConfig } from '../../src/opencode/config.js';

describe('generateSessionConfig', () => {
  it('generates empty config when no MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'anthropic',
      model: 'claude-4-opus',
    });
    expect(config.mcp).toBeUndefined();
  });

  it('generates config with local (stdio) MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'filesystem',
          type: 'stdio',
          command: 'npx -y @modelcontextprotocol/server-filesystem /tmp',
        },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp).toBeDefined();
    expect(mcp.filesystem).toEqual({
      type: 'local',
      command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
  });

  it('generates config with remote (SSE) MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'remote-server',
          type: 'sse',
          url: 'http://localhost:8080/sse',
        },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp).toBeDefined();
    expect(mcp['remote-server']).toEqual({
      type: 'remote',
      url: 'http://localhost:8080/sse',
    });
  });

  it('parses env vars for MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'server-with-env',
          type: 'stdio',
          command: 'node server.js',
          env_vars: JSON.stringify({ API_KEY: 'secret', PORT: '3000' }),
        },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp['server-with-env']).toEqual({
      type: 'local',
      command: ['node', 'server.js'],
      env: { API_KEY: 'secret', PORT: '3000' },
    });
  });

  it('handles empty env_vars for MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'no-env',
          type: 'stdio',
          command: 'echo hello',
        },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp['no-env']).toEqual({
      type: 'local',
      command: ['echo', 'hello'],
    });
    expect(mcp['no-env'].env).toBeUndefined();
  });

  it('handles empty mcpServers array', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [],
    });
    expect(config.mcp).toBeUndefined();
  });

  it('handles invalid env_vars JSON gracefully', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'bad-env',
          type: 'stdio',
          command: 'echo test',
          env_vars: 'not-valid-json',
        },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp['bad-env'].env).toBeUndefined();
  });

  it('skips stdio servers with empty command', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        { name: 'empty-cmd', type: 'stdio', command: '' },
      ],
    });
    expect(config.mcp).toBeUndefined();
  });

  it('skips SSE servers with no url', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        { name: 'no-url', type: 'sse' },
      ],
    });
    expect(config.mcp).toBeUndefined();
  });

  it('combines multiple MCP servers', () => {
    const config = generateSessionConfig({
      provider: 'anthropic',
      model: 'claude-4-opus',
      mcpServers: [
        { name: 'fs', type: 'stdio', command: 'npx fs-server' },
        { name: 'api', type: 'sse', url: 'http://localhost:3000' },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(Object.keys(mcp)).toEqual(['fs', 'api']);
    expect(mcp.fs.type).toBe('local');
    expect(mcp.api.type).toBe('remote');
  });

  it('accepts "local" type directly', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        { name: 'test', type: 'local', command: 'npx test-server' },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp.test.type).toBe('local');
  });

  it('accepts "remote" type directly', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        { name: 'test', type: 'remote', url: 'http://localhost:9000' },
      ],
    });

    const mcp = config.mcp as Record<string, any>;
    expect(mcp.test.type).toBe('remote');
  });
});
