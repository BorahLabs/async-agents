import { createWorkerInstance, executePrompt } from '../opencode/client.js';
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
import { getSkillByName } from '../db/queries/skills.js';
import type { McpServer } from '../db/queries/mcpServers.js';
import type { Skill } from '../db/queries/skills.js';

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

  async start(): Promise<void> {
    try {
      this.instance = await createWorkerInstance(this._id);
      this._running = true;
      this.stopping = false;
      console.log(`[worker:${this._id}] Started`);
      this.pollLoop();
    } catch (error) {
      console.error(`[worker:${this._id}] Failed to start:`, error);
      this._running = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log(`[worker:${this._id}] Stopping...`);
    this.stopping = true;

    // Wait for the worker to finish its current work
    const maxWaitMs = 60_000;
    const checkIntervalMs = 200;
    let waited = 0;
    while (this._running && waited < maxWaitMs) {
      await sleep(checkIntervalMs);
      waited += checkIntervalMs;
    }

    this._running = false;
    this.instance = null;
    console.log(`[worker:${this._id}] Stopped`);
  }

  private async pollLoop(): Promise<void> {
    while (this._running && !this.stopping) {
      try {
        const message = getNextQueuedMessage();

        if (!message) {
          await sleep(this.pollIntervalMs);
          continue;
        }

        console.log(`[worker:${this._id}] Processing message ${message.id}`);
        await this.processMessage(message.id);
      } catch (error) {
        console.error(`[worker:${this._id}] Poll loop error:`, error);
        await sleep(this.pollIntervalMs);
      }
    }

    this._running = false;
  }

  private async processMessage(messageId: string): Promise<void> {
    // 1. Mark message as 'processing' with started_at
    updateMessageStatus(messageId, 'processing');

    const message = getMessage(messageId);
    if (!message) {
      console.error(`[worker:${this._id}] Message ${messageId} not found`);
      return;
    }

    // 2. Get the session from DB
    const session = getSession(message.session_id);
    if (!session) {
      console.error(
        `[worker:${this._id}] Session ${message.session_id} not found for message ${messageId}`
      );
      updateMessageStatus(messageId, 'failed', {
        error: `Session ${message.session_id} not found`,
      });
      return;
    }

    // 3. Resolve MCP servers
    const mcpServers: Array<{
      name: string;
      type: string;
      command?: string;
      url?: string;
      env_vars?: string;
    }> = [];

    try {
      const mcpServerNames: string[] = session.mcp_servers
        ? JSON.parse(session.mcp_servers)
        : [];

      for (const name of mcpServerNames) {
        const server: McpServer | undefined = getMcpServerByName(name);
        if (server) {
          mcpServers.push({
            name: server.name,
            type: server.type,
            command: server.command ?? undefined,
            url: server.url ?? undefined,
            env_vars: server.env_vars ?? undefined,
          });
        } else {
          console.warn(
            `[worker:${this._id}] MCP server "${name}" not found, skipping`
          );
        }
      }
    } catch (error) {
      console.warn(
        `[worker:${this._id}] Failed to parse mcp_servers JSON for session ${session.id}:`,
        error
      );
    }

    // 4. Resolve skills
    const skills: Array<{
      name: string;
      system_prompt: string;
      allowed_tools?: string;
      model_provider?: string;
      model_id?: string;
    }> = [];

    try {
      const skillNames: string[] = session.skills
        ? JSON.parse(session.skills)
        : [];

      for (const name of skillNames) {
        const skill: Skill | undefined = getSkillByName(name);
        if (skill) {
          skills.push({
            name: skill.name,
            system_prompt: skill.system_prompt,
            allowed_tools: skill.allowed_tools ?? undefined,
            model_provider: skill.model_provider ?? undefined,
            model_id: skill.model_id ?? undefined,
          });
        } else {
          console.warn(
            `[worker:${this._id}] Skill "${name}" not found, skipping`
          );
        }
      }
    } catch (error) {
      console.warn(
        `[worker:${this._id}] Failed to parse skills JSON for session ${session.id}:`,
        error
      );
    }

    // 5. Call executePrompt() with all resolved data
    try {
      const result: PromptResult = await executePrompt(this.instance!, {
        sessionId: session.id,
        opencodeSessionId: session.opencode_session_id,
        text: message.content ?? '',
        systemPrompt: session.system_prompt,
        provider: session.provider,
        model: session.model,
        mcpServers,
        skills,
        workingDirectory: session.working_directory,
        structuredOutputSchema: message.structured_output_schema,
      });

      // 6a. Create assistant message in DB
      const assistantMessage = createMessage({
        session_id: session.id,
        role: 'assistant',
        content: result.content,
        structured_output_schema: message.structured_output_schema,
      });

      // Mark assistant message as completed, with structured output if present
      updateMessageStatus(assistantMessage.id, 'completed', {
        structured_output_result:
          result.structuredOutput !== undefined
            ? JSON.stringify(result.structuredOutput)
            : undefined,
      });

      // 6b. Record tool calls for the assistant message
      for (const tc of result.toolCalls) {
        recordToolCall({
          message_id: assistantMessage.id,
          tool_name: tc.toolName,
          input: tc.input,
          output: tc.output,
          duration_ms: tc.durationMs,
        });
      }

      // 6c. Record token usage for both user and assistant messages
      const rawUsage = JSON.stringify(result.tokenUsage);
      recordTokenUsage({
        message_id: messageId,
        session_id: session.id,
        provider: session.provider,
        model: session.model,
        raw_usage: rawUsage,
      });
      recordTokenUsage({
        message_id: assistantMessage.id,
        session_id: session.id,
        provider: session.provider,
        model: session.model,
        raw_usage: rawUsage,
      });

      // 6d. Update session's opencode_session_id if it was null
      if (!session.opencode_session_id) {
        updateSession(session.id, {
          opencode_session_id: result.opencodeSessionId,
        });
      }

      // 6e. Mark original user message as 'completed'
      updateMessageStatus(messageId, 'completed');

      console.log(
        `[worker:${this._id}] Message ${messageId} completed successfully`
      );
    } catch (error) {
      // 7. On failure: retry logic
      const currentRetryCount = message.retry_count;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (currentRetryCount < 5) {
        // 7a. Exponential backoff: 10s * 3^retryCount
        const backoffSeconds = 10 * Math.pow(3, currentRetryCount);
        const nextRetryAt = new Date(
          Date.now() + backoffSeconds * 1000
        ).toISOString();

        console.warn(
          `[worker:${this._id}] Message ${messageId} failed (attempt ${currentRetryCount + 1}/5), retrying in ${backoffSeconds}s: ${errorMessage}`
        );

        updateMessageStatus(messageId, 'queued', {
          retry_count: currentRetryCount + 1,
          next_retry_at: nextRetryAt,
          error: errorMessage,
        });
      } else {
        // 7b. Max retries exceeded
        console.error(
          `[worker:${this._id}] Message ${messageId} failed permanently after 5 retries: ${errorMessage}`
        );

        updateMessageStatus(messageId, 'failed', {
          error: errorMessage,
        });
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
