import { useCallback } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'
import StatusBadge from '../components/StatusBadge'

interface DashboardData {
  workers: { active: number; total: number }
  queueLength: number
  totalSessions: number
  recentMessages: Array<{
    id: string
    sessionId: string
    role: string
    content: string
    status: string
    createdAt: string
  }>
  tokenUsage: Array<{
    provider: string
    inputTokens: number
    outputTokens: number
  }>
}

export default function Dashboard() {
  const fetcher = useCallback(() => adminApi<DashboardData>('/dashboard'), [])
  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Active Workers</div>
          <div className="stat-value">
            {data.workers.active}
            <span className="stat-secondary">/ {data.workers.total}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Queue Length</div>
          <div className="stat-value">{data.queueLength}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Sessions</div>
          <div className="stat-value">{data.totalSessions}</div>
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
                    <td className="truncate-cell">{msg.content}</td>
                    <td><StatusBadge status={msg.status} /></td>
                    <td className="nowrap">{new Date(msg.createdAt).toLocaleTimeString()}</td>
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
          <h2 className="card-title">Token Usage by Provider</h2>
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
                {data.tokenUsage.map((tu) => (
                  <tr key={tu.provider}>
                    <td>{tu.provider}</td>
                    <td>{tu.inputTokens.toLocaleString()}</td>
                    <td>{tu.outputTokens.toLocaleString()}</td>
                    <td>{(tu.inputTokens + tu.outputTokens).toLocaleString()}</td>
                  </tr>
                ))}
                {data.tokenUsage.length === 0 && (
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
