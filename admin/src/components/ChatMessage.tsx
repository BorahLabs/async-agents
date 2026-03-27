import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import StatusBadge from './StatusBadge'
import ToolCallCard from './ToolCallCard'

interface ToolCall {
  name: string
  input?: unknown
  output?: unknown
  duration?: number
}

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system'
  content: string
  status?: string
  toolCalls?: ToolCall[]
  tokenUsage?: { input?: number; output?: number }
  timestamp?: string
  structuredOutput?: unknown
}

export default function ChatMessage({
  role,
  content,
  status,
  toolCalls,
  tokenUsage,
  timestamp,
  structuredOutput,
}: ChatMessageProps) {
  const isUser = role === 'user'

  return (
    <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-assistant'}`}>
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
        <div className="chat-message-header">
          <span className="chat-role">{role}</span>
          {status && <StatusBadge status={status} />}
          {timestamp && (
            <span className="chat-timestamp">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="chat-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>

        {structuredOutput != null && (
          <div className="chat-structured-output">
            <div className="tool-call-label">Structured Output</div>
            <pre className="tool-call-json">{JSON.stringify(structuredOutput, null, 2)}</pre>
          </div>
        )}

        {toolCalls && toolCalls.length > 0 && (
          <div className="chat-tool-calls">
            {toolCalls.map((tc, i) => (
              <ToolCallCard key={i} {...tc} />
            ))}
          </div>
        )}

        {tokenUsage && (
          <div className="chat-token-usage">
            {tokenUsage.input != null && <span>In: {tokenUsage.input}</span>}
            {tokenUsage.output != null && <span>Out: {tokenUsage.output}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
