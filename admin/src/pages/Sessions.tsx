import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'
import StatusBadge from '../components/StatusBadge'

interface SessionRow {
  id: string
  title: string | null
  status: string
  provider: string
  model: string
  created_at: string
  updated_at: string
}

interface SessionsResponse {
  data: SessionRow[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export default function Sessions() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const limit = 20

  const fetcher = useCallback(
    () => adminApi<SessionsResponse>(`/sessions?page=${page}&limit=${limit}`),
    [page]
  )
  const { data, error } = usePolling(fetcher)

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  const totalPages = data.pagination.totalPages

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
                <th>Created</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr
                  key={s.id}
                  className="clickable-row"
                  onClick={() => navigate(`/sessions/${s.id}`)}
                >
                  <td>{s.title || s.id.slice(0, 12)}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                    <span className="provider-model">
                      {s.provider} / {s.model}
                    </span>
                  </td>
                  <td className="nowrap">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="nowrap">{new Date(s.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No sessions</td></tr>
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
