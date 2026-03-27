import { useCallback } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'
import StatusBadge from '../components/StatusBadge'

interface TokenStat {
  provider: string
  date: string
  total_input: number
  total_output: number
}

interface DashboardData {
  workers: { active: number; max: number; queueLength: number }
  sessions: { total: number; active: number; todayCount: number }
  recentMessages: Array<{
    id: string
    session_id: string
    role: string
    content: string | null
    status: string
    queued_at: string
    completed_at: string | null
    failed_at: string | null
  }>
  tokenUsage: {
    day: TokenStat[]
    week: TokenStat[]
    month: TokenStat[]
  }
}

export default function Dashboard() {
  const fetcher = useCallback(() => adminApi<DashboardData>('/dashboard'), [])
  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  // Aggregate token usage from the month view by provider
  const usageByProvider = new Map<string, { input: number; output: number }>()
  for (const row of data.tokenUsage.month) {
    const existing = usageByProvider.get(row.provider) || { input: 0, output: 0 }
    existing.input += row.total_input || 0
    existing.output += row.total_output || 0
    usageByProvider.set(row.provider, existing)
  }

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Active Workers</div>
          <div className="stat-value">
            {data.workers.active}
            <span className="stat-secondary">/ {data.workers.max}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Queue Length</div>
          <div className="stat-value">{data.workers.queueLength}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Sessions</div>
          <div className="stat-value">{data.sessions.total}</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2 className="card-title">Recent Messages</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recentMessages.map((msg) => (
                  <tr key={msg.id}>
                    <td>
                      <span className={`role-tag role-${msg.role}`}>{msg.role}</span>
                    </td>
                    <td className="truncate-cell">{msg.content || '—'}</td>
                    <td><StatusBadge status={msg.status} /></td>
                    <td className="nowrap">
                      {new Date(msg.completed_at || msg.failed_at || msg.queued_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {data.recentMessages.length === 0 && (
                  <tr><td colSpan={4} className="empty-row">No messages yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Token Usage by Provider (30d)</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {[...usageByProvider.entries()].map(([provider, usage]) => (
                  <tr key={provider}>
                    <td>{provider}</td>
                    <td>{usage.input.toLocaleString()}</td>
                    <td>{usage.output.toLocaleString()}</td>
                    <td>{(usage.input + usage.output).toLocaleString()}</td>
                  </tr>
                ))}
                {usageByProvider.size === 0 && (
                  <tr><td colSpan={4} className="empty-row">No usage data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
