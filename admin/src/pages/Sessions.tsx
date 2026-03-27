import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge'

interface Session {
  id: string
  title: string
  status: string
  provider: string
  model: string
  messageCount: number
  createdAt: string
  lastActiveAt: string
}

interface SessionsResponse {
  sessions: Session[]
  total: number
  page: number
  pageSize: number
}

export default function Sessions() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const pageSize = 20

  const fetcher = useCallback(
    () => api<SessionsResponse>(`/sessions?page=${page}&pageSize=${pageSize}`),
    [page]
  )
  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  const totalPages = Math.ceil(data.total / pageSize)

  return (
    <div className="page">
      <h1 className="page-title">Sessions</h1>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Provider / Model</th>
                <th>Messages</th>
                <th>Created</th>
                <th>Last Active</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr
                  key={s.id}
                  className="clickable-row"
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  <td>{s.title || s.id.slice(0, 8)}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <span className="provider-model">
                      {s.provider} / {s.model}
                    </span>
                  </td>
                  <td>{s.messageCount}</td>
                  <td className="nowrap">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="nowrap">{new Date(s.lastActiveAt).toLocaleString()}</td>
                </tr>
              ))}
              {data.sessions.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No sessions</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
