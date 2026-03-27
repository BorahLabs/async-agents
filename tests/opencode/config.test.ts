import { describe, it, expect } from 'vitest';
import { generateSessionConfig } from '../../src/opencode/config.js';
import type { McpServerInput, SkillInput, SessionConfigParams } from '../../src/opencode/config.js';

describe('generateSessionConfig', () => {
  it('generates basic provider/model config', () => {
    const config = generateSessionConfig({
      provider: 'anthropic',
      model: 'claude-4-opus',
    });

    expect(config.provider).toEqual({
      anthropic: {
        models: {
          'claude-4-opus': {},
        },
      },
    });
    // No mcpServers or agents when none provided
    expect(config.mcpServers).toBeUndefined();
    expect(config.agents).toBeUndefined();
  });

  it('generates config with stdio MCP servers', () => {
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

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(mcpServers).toBeDefined();
    expect(mcpServers.filesystem).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    });
  });

  it('generates config with SSE MCP servers', () => {
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

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(mcpServers).toBeDefined();
    expect(mcpServers['remote-server']).toEqual({
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

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(mcpServers['server-with-env']).toEqual({
      command: 'node',
      args: ['server.js'],
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

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(mcpServers['no-env']).toEqual({
      command: 'echo',
      args: ['hello'],
    });
    // No env property when env_vars is empty/undefined
    expect(mcpServers['no-env'].env).toBeUndefined();
  });

  it('generates config with skills (agents)', () => {
    const config = generateSessionConfig({
      provider: 'anthropic',
      model: 'claude-4-opus',
      skills: [
        {
          name: 'code-review',
          system_prompt: 'You are a code reviewer. Be thorough.',
          allowed_tools: '["read_file","write_file"]',
          model_provider: 'anthropic',
          model_id: 'claude-4-sonnet',
        },
      ],
    });

    const agents = config.agents as Record<string, any>;
    expect(agents).toBeDefined();
    expect(agents['code-review']).toEqual({
      systemPrompt: 'You are a code reviewer. Be thorough.',
      tools: ['read_file', 'write_file'],
      model: 'anthropic/claude-4-sonnet',
    });
  });

  it('handles skill with only model_id (no provider)', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      skills: [
        {
          name: 'summarizer',
          system_prompt: 'Summarize text.',
          model_id: 'gpt-4o-mini',
        },
      ],
    });

    const agents = config.agents as Record<string, any>;
    expect(agents.summarizer.model).toBe('gpt-4o-mini');
  });

  it('omits tools when allowed_tools is null/undefined', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      skills: [
        {
          name: 'basic',
          system_prompt: 'Basic skill.',
        },
      ],
    });

    const agents = config.agents as Record<string, any>;
    expect(agents.basic.tools).toBeUndefined();
  });

  it('omits model when neither model_provider nor model_id is set', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      skills: [
        {
          name: 'minimal',
          system_prompt: 'Minimal.',
        },
      ],
    });

    const agents = config.agents as Record<string, any>;
    expect(agents.minimal.model).toBeUndefined();
  });

  it('handles empty mcpServers array', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [],
    });
    expect(config.mcpServers).toBeUndefined();
  });

  it('handles empty skills array', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      skills: [],
    });
    expect(config.agents).toBeUndefined();
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

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(mcpServers['bad-env'].env).toBeUndefined();
  });

  it('handles invalid allowed_tools JSON gracefully', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      skills: [
        {
          name: 'bad-tools',
          system_prompt: 'Prompt.',
          allowed_tools: 'not-json',
        },
      ],
    });

    const agents = config.agents as Record<string, any>;
    expect(agents['bad-tools'].tools).toBeUndefined();
  });

  it('skips stdio servers with empty command', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'empty-cmd',
          type: 'stdio',
          command: '',
        },
      ],
    });
    // No valid servers, so mcpServers should be undefined
    expect(config.mcpServers).toBeUndefined();
  });

  it('skips SSE servers with no url', () => {
    const config = generateSessionConfig({
      provider: 'openai',
      model: 'gpt-4o',
      mcpServers: [
        {
          name: 'no-url',
          type: 'sse',
        },
      ],
    });
    expect(config.mcpServers).toBeUndefined();
  });

  it('combines multiple MCP servers and skills', () => {
    const config = generateSessionConfig({
      provider: 'anthropic',
      model: 'claude-4-opus',
      mcpServers: [
        { name: 'fs', type: 'stdio', command: 'npx fs-server' },
        { name: 'api', type: 'sse', url: 'http://localhost:3000' },
      ],
      skills: [
        { name: 'review', system_prompt: 'Review code.' },
        { name: 'test', system_prompt: 'Write tests.' },
      ],
    });

    const mcpServers = config.mcpServers as Record<string, any>;
    expect(Object.keys(mcpServers)).toEqual(['fs', 'api']);

    const agents = config.agents as Record<string, any>;
    expect(Object.keys(agents)).toEqual(['review', 'test']);
  });
});
