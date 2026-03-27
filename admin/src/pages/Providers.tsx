import { useCallback, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'

interface ProviderRaw {
  id: string
  name: string
  type: string
  base_url: string | null
  api_key: string
  models: string | null
  created_at: string
  updated_at: string
}

interface Provider {
  id: string
  name: string
  type: string
  baseUrl: string
  models: string[]
  createdAt: string
}

function parseProvider(p: ProviderRaw): Provider {
  let models: string[] = []
  if (p.models) {
    try { models = JSON.parse(p.models) } catch { models = [] }
  }
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.base_url || '',
    models,
    createdAt: p.created_at,
  }
}

const emptyForm = { name: '', type: 'openai', baseUrl: '', apiKey: '', models: '' }

export default function Providers() {
  const fetcher = useCallback(async () => {
    const raw = await adminApi<ProviderRaw[]>('/providers')
    return raw.map(parseProvider)
  }, [])
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

  const openEdit = (p: Provider) => {
    setEditing(p.id)
    setForm({
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl || '',
      apiKey: '',
      models: p.models.join(', '),
    })
    setFormError('')
  }

  const save = async () => {
    setSaving(true)
    setFormError('')
    try {
      const body = {
        name: form.name,
        type: form.type,
        baseUrl: form.baseUrl || undefined,
        apiKey: form.apiKey || undefined,
        models: form.models.split(',').map((m) => m.trim()).filter(Boolean),
      }
      if (editing === 'new') {
        await adminApi('/providers', { method: 'POST', body: JSON.stringify(body) })
      } else {
        await adminApi(`/providers/${editing}`, { method: 'PUT', body: JSON.stringify(body) })
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
    if (!confirm('Delete this provider?')) return
    try {
      await adminApi(`/providers/${id}`, { method: 'DELETE' })
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
        <h1 className="page-title">Providers</h1>
        <button className="btn btn-primary" onClick={openNew}>Add Provider</button>
      </div>

      {editing && (
        <div className="card form-card">
          <h2 className="card-title">{editing === 'new' ? 'New Provider' : 'Edit Provider'}</h2>
          {formError && <div className="form-error">{formError}</div>}
          <div className="form-grid">
            <label className="form-field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Type</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="form-field">
              <span>Base URL</span>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="form-field">
              <span>API Key</span>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder={editing !== 'new' ? '(unchanged)' : ''}
              />
            </label>
            <label className="form-field form-field-full">
              <span>Models (comma-separated)</span>
              <input
                value={form.models}
                onChange={(e) => setForm({ ...form, models: e.target.value })}
                placeholder="gpt-4o, gpt-4o-mini"
              />
            </label>
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
                <th>Base URL</th>
                <th>Models</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td><span className="type-tag">{p.type}</span></td>
                  <td className="truncate-cell">{p.baseUrl || '—'}</td>
                  <td>{p.models.join(', ')}</td>
                  <td className="nowrap">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No providers configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
