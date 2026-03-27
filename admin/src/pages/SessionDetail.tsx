import { useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'
import ChatMessage from '../components/ChatMessage'

interface SessionRow {
  id: string
  title: string | null
  status: string
  provider: string
  model: string
  system_prompt: string | null
  working_directory: string | null
  mcp_servers: string | null
  skills: string | null
  created_at: string
}

interface MessageRow {
  id: string
  role: string
  content: string | null
  status: string
  structured_output_result: string | null
  queued_at: string
  completed_at: string | null
  tool_calls: Array<{
    id: string
    tool_name: string
    input: string | null
    output: string | null
    duration_ms: number | null
  }>
  token_usage: Array<{
    raw_usage: string
  }>
}

interface SessionDetailData {
  session: SessionRow
  messages: MessageRow[]
}

function parseJsonArray(val: string | null): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()

  const fetcher = useCallback(async (): Promise<SessionDetailData> => {
    const [session, msgData] = await Promise.all([
      adminApi<SessionRow>(`/sessions/${id}`),
      adminApi<{ messages: MessageRow[] }>(`/sessions/${id}/messages`),
    ])
    return { session, messages: msgData.messages }
  }, [id])

  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  const { session, messages } = data
  const mcpServers = parseJsonArray(session.mcp_servers)
  const skills = parseJsonArray(session.skills)

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/sessions" className="back-link">← Sessions</Link>
        <h1 className="page-title">{session.title || session.id.slice(0, 12)}</h1>
      </div>

      <div className="card session-config-card">
        <h2 className="card-title">Configuration</h2>
        <div className="config-grid">
          <div className="config-item">
            <span className="config-label">Provider</span>
            <span className="config-value">{session.provider}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Model</span>
            <span className="config-value">{session.model}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Working Directory</span>
            <span className="config-value">{session.working_directory || '—'}</span>
          </div>
          <div className="config-item">
            <span className="config-label">MCP Servers</span>
            <span className="config-value">
              {mcpServers.length ? mcpServers.join(', ') : '—'}
            </span>
          </div>
          <div className="config-item">
            <span className="config-label">Skills</span>
            <span className="config-value">
              {skills.length ? skills.join(', ') : '—'}
            </span>
          </div>
          {session.system_prompt && (
            <div className="config-item config-item-full">
              <span className="config-label">System Prompt</span>
              <pre className="config-prompt">{session.system_prompt}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="chat-container">
        {messages.map((msg) => {
          // Extract token counts from raw_usage
          let tokenUsage: { input?: number; output?: number } | undefined
          if (msg.token_usage?.length) {
            try {
              const raw = JSON.parse(msg.token_usage[0].raw_usage)
              tokenUsage = {
                input: raw.input_tokens || raw.prompt_tokens,
                output: raw.output_tokens || raw.completion_tokens,
              }
            } catch { /* ignore */ }
          }

          // Parse tool calls
          const toolCalls = msg.tool_calls?.map(tc => ({
            name: tc.tool_name,
            input: tc.input ? JSON.parse(tc.input) : undefined,
            output: tc.output ? JSON.parse(tc.output) : undefined,
            duration: tc.duration_ms ?? undefined,
          }))

          return (
            <ChatMessage
              key={msg.id}
              role={msg.role as 'user' | 'assistant'}
              content={msg.content || ''}
              status={msg.status}
              toolCalls={toolCalls}
              tokenUsage={tokenUsage}
              structuredOutput={
                msg.structured_output_result
                  ? JSON.parse(msg.structured_output_result)
                  : undefined
              }
              timestamp={msg.completed_at || msg.queued_at}
            />
          )
        })}
        {messages.length === 0 && (
          <div className="empty-chat">No messages in this session yet.</div>
        )}
      </div>
    </div>
  )
}
