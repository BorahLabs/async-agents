import { useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { api } from '../api'
import ChatMessage from '../components/ChatMessage'

interface ToolCall {
  name: string
  input?: unknown
  output?: unknown
  duration?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  status: string
  toolCalls?: ToolCall[]
  tokenUsage?: { input?: number; output?: number }
  structuredOutput?: unknown
  createdAt: string
}

interface SessionConfig {
  provider: string
  model: string
  systemPrompt: string
  mcpServers: string[]
  skills: string[]
  workingDirectory: string
}

interface SessionDetailData {
  id: string
  title: string
  status: string
  config: SessionConfig
  messages: Message[]
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>()

  const fetcher = useCallback(
    () => api<SessionDetailData>(`/sessions/${id}`),
    [id]
  )
  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  const { config } = data

  return (
    <div className="page">
      <div className="page-header">
        <Link to="/sessions" className="back-link">← Sessions</Link>
        <h1 className="page-title">{data.title || data.id.slice(0, 8)}</h1>
      </div>

      <div className="card session-config-card">
        <h2 className="card-title">Configuration</h2>
        <div className="config-grid">
          <div className="config-item">
            <span className="config-label">Provider</span>
            <span className="config-value">{config.provider}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Model</span>
            <span className="config-value">{config.model}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Working Directory</span>
            <span className="config-value">{config.workingDirectory || '—'}</span>
          </div>
          <div className="config-item">
            <span className="config-label">MCP Servers</span>
            <span className="config-value">
              {config.mcpServers?.length ? config.mcpServers.join(', ') : '—'}
            </span>
          </div>
          <div className="config-item">
            <span className="config-label">Skills</span>
            <span className="config-value">
              {config.skills?.length ? config.skills.join(', ') : '—'}
            </span>
          </div>
          {config.systemPrompt && (
            <div className="config-item config-item-full">
              <span className="config-label">System Prompt</span>
              <pre className="config-prompt">{config.systemPrompt}</pre>
            </div>
          )}
        </div>
      </div>

      <div className="chat-container">
        {data.messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            role={msg.role}
            content={msg.content}
            status={msg.status}
            toolCalls={msg.toolCalls}
            tokenUsage={msg.tokenUsage}
            structuredOutput={msg.structuredOutput}
            timestamp={msg.createdAt}
          />
        ))}
        {data.messages.length === 0 && (
          <div className="empty-chat">No messages in this session yet.</div>
        )}
      </div>
    </div>
  )
}
