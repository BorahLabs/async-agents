import { useState } from 'react'

interface ToolCallCardProps {
  name: string
  input?: unknown
  output?: unknown
  duration?: number
}

export default function ToolCallCard({ name, input, output, duration }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="tool-call-card">
      <div className="tool-call-header" onClick={() => setExpanded(!expanded)}>
        <span className="tool-call-icon">{expanded ? '▾' : '▸'}</span>
        <span className="tool-call-name">{name}</span>
        {duration != null && (
          <span className="tool-call-duration">{duration}ms</span>
        )}
      </div>
      {expanded && (
        <div className="tool-call-body">
          {input != null && (
            <div className="tool-call-section">
              <div className="tool-call-label">Input</div>
              <pre className="tool-call-json">{JSON.stringify(input, null, 2)}</pre>
            </div>
          )}
          {output != null && (
            <div className="tool-call-section">
              <div className="tool-call-label">Output</div>
              <pre className="tool-call-json">{JSON.stringify(output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
