import { useCallback, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'

interface McpServer {
  id: string
  name: string
  type: 'stdio' | 'sse'
  command?: string
  url?: string
  env?: Record<string, string>
  description?: string
  createdAt: string
}

const emptyForm = {
  name: '',
  type: 'stdio' as 'stdio' | 'sse',
  command: '',
  url: '',
  envPairs: [{ key: '', value: '' }] as { key: string; value: string }[],
  description: '',
}

export default function McpServers() {
  const fetcher = useCallback(() => adminApi<McpServer[]>('/mcp-servers'), [])
  const { data, error, refresh } = usePolling(fetcher)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const openNew = () => {
    setEditing('new')
    setForm(emptyForm)
    setFormError('')
  }

  const openEdit = (s: McpServer) => {
    setEditing(s.id)
    const envPairs = s.env
      ? Object.entries(s.env).map(([key, value]) => ({ key, value }))
      : [{ key: '', value: '' }]
    setForm({
      name: s.name,
      type: s.type,
      command: s.command || '',
      url: s.url || '',
      envPairs: envPairs.length ? envPairs : [{ key: '', value: '' }],
      description: s.description || '',
    })
    setFormError('')
  }

  const setEnvPair = (idx: number, field: 'key' | 'value', val: string) => {
    const pairs = [...form.envPairs]
    pairs[idx] = { ...pairs[idx], [field]: val }
    setForm({ ...form, envPairs: pairs })
  }

  const addEnvPair = () => {
    setForm({ ...form, envPairs: [...form.envPairs, { key: '', value: '' }] })
  }

  const removeEnvPair = (idx: number) => {
    const pairs = form.envPairs.filter((_, i) => i !== idx)
    setForm({ ...form, envPairs: pairs.length ? pairs : [{ key: '', value: '' }] })
  }

  const save = async () => {
    setSaving(true)
    setFormError('')
    try {
      const env: Record<string, string> = {}
      for (const p of form.envPairs) {
        if (p.key.trim()) env[p.key.trim()] = p.value
      }
      const body = {
        name: form.name,
        type: form.type,
        command: form.type === 'stdio' ? form.command : undefined,
        url: form.type === 'sse' ? form.url : undefined,
        env: Object.keys(env).length ? env : undefined,
        description: form.description || undefined,
      }
      if (editing === 'new') {
        await adminApi('/mcp-servers', { method: 'POST', body: JSON.stringify(body) })
      } else {
        await adminApi(`/mcp-servers/${editing}`, { method: 'PUT', body: JSON.stringify(body) })
      }
      setEditing(null)
      refresh()
    } catch (e) {
      setFormError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this MCP server?')) return
    try {
      await adminApi(`/mcp-servers/${id}`, { method: 'DELETE' })
      refresh()
    } catch (e) {
      alert(String(e))
    }
  }

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">MCP Servers</h1>
        <button className="btn btn-primary" onClick={openNew}>Add Server</button>
      </div>

      {editing && (
        <div className="card form-card">
          <h2 className="card-title">{editing === 'new' ? 'New MCP Server' : 'Edit MCP Server'}</h2>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="form-field">
              <span>Type</span>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="mcp-type"
                    value="stdio"
                    checked={form.type === 'stdio'}
                    onChange={() => setForm({ ...form, type: 'stdio' })}
                  />
                  stdio
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="mcp-type"
                    value="sse"
                    checked={form.type === 'sse'}
                    onChange={() => setForm({ ...form, type: 'sse' })}
                  />
                  sse
                </label>
              </div>
            </div>
            {form.type === 'stdio' && (
              <label className="form-field form-field-full">
                <span>Command</span>
                <input
                  value={form.command}
                  onChange={(e) => setForm({ ...form, command: e.target.value })}
                  placeholder="npx @modelcontextprotocol/server-filesystem /tmp"
                />
              </label>
            )}
            {form.type === 'sse' && (
              <label className="form-field form-field-full">
                <span>URL</span>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="http://localhost:8080/sse"
                />
              </label>
            )}
            <label className="form-field form-field-full">
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <div className="form-field form-field-full">
              <span>Environment Variables</span>
              <div className="env-pairs">
                {form.envPairs.map((pair, i) => (
                  <div key={i} className="env-pair-row">
                    <input
                      placeholder="KEY"
                      value={pair.key}
                      onChange={(e) => setEnvPair(i, 'key', e.target.value)}
                    />
                    <input
                      placeholder="value"
                      value={pair.value}
                      onChange={(e) => setEnvPair(i, 'value', e.target.value)}
                    />
                    <button className="btn btn-sm btn-danger" onClick={() => removeEnvPair(i)}>×</button>
                  </div>
                ))}
                <button className="btn btn-sm" onClick={addEnvPair}>+ Add Env Var</button>
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Command / URL</th>
                <th>Description</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td><span className="type-tag">{s.type}</span></td>
                  <td className="truncate-cell">{s.type === 'stdio' ? s.command : s.url}</td>
                  <td>{s.description || '—'}</td>
                  <td className="nowrap">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No MCP servers configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
