import { createWorkerInstance, reconfigureForSession, executePrompt } from '../opencode/client.js';
import type { OpenCodeInstance, PromptResult } from '../opencode/client.js';
import {
  getMessage,
  updateMessageStatus,
  getNextQueuedMessage,
  createMessage,
} from '../db/queries/messages.js';
import { getSession, updateSession } from '../db/queries/sessions.js';
import { recordTokenUsage } from '../db/queries/tokenUsage.js';
import { recordToolCall } from '../db/queries/toolCalls.js';
import { getMcpServerByName } from '../db/queries/mcpServers.js';
import { getSkillByName } from '../skills.js';
import type { Skill } from '../skills.js';
import { getProviderByName } from '../db/queries/providers.js';
import type { McpServer } from '../db/queries/mcpServers.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Worker {
  private _id: number;
  private _running: boolean = false;
  private stopping: boolean = false;
  private instance: OpenCodeInstance | null = null;
  private pollIntervalMs: number = 1000;

  constructor(id: number) {
    this._id = id;
  }

  private log(msg: string): void {
    console.log(`[worker:${this._id}] ${msg}`);
  }

  private warn(msg: string): void {
    console.warn(`[worker:${this._id}] ${msg}`);
  }

  private error(msg: string, err?: unknown): void {
    if (err) {
      console.error(`[worker:${this._id}] ${msg}`, err);
    } else {
      console.error(`[worker:${this._id}] ${msg}`);
    }
  }

  async start(): Promise<void> {
    try {
      this.instance = await createWorkerInstance(this._id);
      this._running = true;
      this.stopping = false;
      this.log('Started');
      this.pollLoop();
    } catch (error) {
      this.error('Failed to start:', error);
      this._running = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.log('Stopping...');
    this.stopping = true;
    const maxWaitMs = 60_000;
    const checkIntervalMs = 200;
    let waited = 0;
    while (this._running && waited < maxWaitMs) {
      await sleep(checkIntervalMs);
      waited += checkIntervalMs;
    }
    this._running = false;
    this.instance = null;
    this.log('Stopped');
  }

  private async pollLoop(): Promise<void> {
    while (this._running && !this.stopping) {
      try {
        const message = getNextQueuedMessage();

        if (!message) {
          await sleep(this.pollIntervalMs);
          continue;
        }

        this.log(`Processing message ${message.id} (session: ${message.session_id})`);
        await this.processMessage(message.id);
        this.log(`Finished processing message ${message.id}`);
      } catch (error) {
        this.error('Poll loop error:', error);
        await sleep(this.pollIntervalMs);
      }
    }

    this._running = false;
    this.log('Poll loop ended');
  }

  private async processMessage(messageId: string): Promise<void> {
    updateMessageStatus(messageId, 'processing');

    const message = getMessage(messageId);
    if (!message) {
      this.error(`Message ${messageId} not found`);
      return;
    }

    const session = getSession(message.session_id);
    if (!session) {
      this.error(`Session ${message.session_id} not found`);
      updateMessageStatus(messageId, 'failed', { error: `Session ${message.session_id} not found` });
      return;
    }

    this.log(`Session: provider=${session.provider} model=${session.model} mcp=${session.mcp_servers || 'none'} skills=${session.skills || 'none'}`);

    // Resolve MCP servers
    const mcpServers: Array<{ name: string; type: string; command?: string; url?: string; env_vars?: string }> = [];
    try {
      const mcpServerNames: string[] = session.mcp_servers ? JSON.parse(session.mcp_servers) : [];
      for (const name of mcpServerNames) {
        const server: McpServer | undefined = getMcpServerByName(name);
        if (server) {
          mcpServers.push({
            name: server.name, type: server.type,
            command: server.command ?? undefined, url: server.url ?? undefined,
            env_vars: server.env_vars ?? undefined,
          });
          this.log(`Resolved MCP server: ${name} (${server.type})`);
        } else {
          this.warn(`MCP server "${name}" not found, skipping`);
        }
      }
    } catch (e) {
      this.warn(`Failed to parse mcp_servers: ${e}`);
    }

    // Resolve skills
    const skills: Array<{ name: string; system_prompt: string }> = [];
    try {
      const skillNames: string[] = session.skills ? JSON.parse(session.skills) : [];
      for (const name of skillNames) {
        const skill: Skill | undefined = getSkillByName(name);
        if (skill) {
          skills.push({ name: skill.name, system_prompt: skill.systemPrompt });
          this.log(`Resolved skill: ${name}`);
        } else {
          this.warn(`Skill "${name}" not found, skipping`);
        }
      }
    } catch (e) {
      this.warn(`Failed to parse skills: ${e}`);
    }

    // Resolve provider type
    const providerRecord = getProviderByName(session.provider);
    const providerType = providerRecord?.type ?? session.provider;
    this.log(`Provider: ${session.provider} -> type=${providerType}`);

    // Reconfigure for MCP if needed
    if (mcpServers.length > 0) {
      this.log(`Reconfiguring OpenCode instance for ${mcpServers.length} MCP server(s)...`);
      try {
        this.instance = await reconfigureForSession(
          this.instance!, this._id, mcpServers, session.working_directory,
        );
        this.log('Reconfiguration successful');
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.error(`MCP reconfiguration failed: ${msg}`);
        // Try to recover the original worker instance
        try {
          this.log('Attempting to recover worker instance...');
          this.instance = await createWorkerInstance(this._id);
          this.log('Worker instance recovered (without MCP)');
        } catch (recoverError) {
          this.error('Failed to recover worker instance:', recoverError);
        }
      }
    }

    // Execute prompt
    this.log(`Sending prompt to OpenCode (${message.content?.substring(0, 80)}...)`);
    try {
      const result: PromptResult = await executePrompt(this.instance!, {
        sessionId: session.id,
        opencodeSessionId: session.opencode_session_id,
        text: message.content ?? '',
        systemPrompt: session.system_prompt,
        provider: providerType,
        model: session.model,
        mcpServers,
        skills,
        workingDirectory: session.working_directory,
        structuredOutputSchema: message.structured_output_schema,
      });

      this.log(`Got response: ${result.content.substring(0, 100)}... (${result.toolCalls.length} tool calls)`);

      // Create assistant message
      const assistantMessage = createMessage({
        session_id: session.id,
        role: 'assistant',
        content: result.content,
        structured_output_schema: message.structured_output_schema,
      });

      updateMessageStatus(assistantMessage.id, 'completed', {
        structured_output_result: result.structuredOutput !== undefined
          ? JSON.stringify(result.structuredOutput) : undefined,
      });

      // Record tool calls
      for (const tc of result.toolCalls) {
        recordToolCall({
          message_id: assistantMessage.id,
          tool_name: tc.toolName,
          input: tc.input,
          output: tc.output,
          duration_ms: tc.durationMs,
        });
      }

      // Record token usage
      const rawUsage = JSON.stringify(result.tokenUsage);
      this.log(`Token usage: ${rawUsage.substring(0, 150)}`);
      recordTokenUsage({ message_id: messageId, session_id: session.id, provider: session.provider, model: session.model, raw_usage: rawUsage });
      recordTokenUsage({ message_id: assistantMessage.id, session_id: session.id, provider: session.provider, model: session.model, raw_usage: rawUsage });

      // Update session's opencode_session_id
      if (!session.opencode_session_id) {
        updateSession(session.id, { opencode_session_id: result.opencodeSessionId });
      }

      // Mark user message as completed
      updateMessageStatus(messageId, 'completed');
      this.log(`Message ${messageId} completed successfully`);
    } catch (error) {
      const currentRetryCount = message.retry_count;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (currentRetryCount < 5) {
        const backoffSeconds = 10 * Math.pow(3, currentRetryCount);
        const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        this.warn(`Message ${messageId} failed (attempt ${currentRetryCount + 1}/5), retrying in ${backoffSeconds}s: ${errorMessage}`);
        updateMessageStatus(messageId, 'queued', {
          retry_count: currentRetryCount + 1,
          next_retry_at: nextRetryAt,
          error: errorMessage,
        });
      } else {
        this.error(`Message ${messageId} failed permanently after 5 retries: ${errorMessage}`);
        updateMessageStatus(messageId, 'failed', { error: errorMessage });
      }
    }
  }

  get isRunning(): boolean {
    return this._running;
  }

  get workerId(): number {
    return this._id;
  }
}
