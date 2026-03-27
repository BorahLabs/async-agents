import { useCallback, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../api'

interface Skill {
  id: string
  name: string
  description?: string
  systemPrompt: string
  allowedTools: string[]
  modelProvider?: string
  modelId?: string
  createdAt: string
}

const emptyForm = {
  name: '',
  description: '',
  systemPrompt: '',
  allowedTools: '',
  modelProvider: '',
  modelId: '',
}

export default function Skills() {
  const fetcher = useCallback(() => api<Skill[]>('/skills'), [])
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

  const openEdit = (s: Skill) => {
    setEditing(s.id)
    setForm({
      name: s.name,
      description: s.description || '',
      systemPrompt: s.systemPrompt,
      allowedTools: s.allowedTools.join(', '),
      modelProvider: s.modelProvider || '',
      modelId: s.modelId || '',
    })
    setFormError('')
  }

  const save = async () => {
    setSaving(true)
    setFormError('')
    try {
      const tools = form.allowedTools.trim().toLowerCase() === 'all'
        ? ['all']
        : form.allowedTools.split(',').map((t) => t.trim()).filter(Boolean)
      const body = {
        name: form.name,
        description: form.description || undefined,
        systemPrompt: form.systemPrompt,
        allowedTools: tools,
        modelProvider: form.modelProvider || undefined,
        modelId: form.modelId || undefined,
      }
      if (editing === 'new') {
        await api('/skills', { method: 'POST', body: JSON.stringify(body) })
      } else {
        await api(`/skills/${editing}`, { method: 'PUT', body: JSON.stringify(body) })
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
    if (!confirm('Delete this skill?')) return
    try {
      await api(`/skills/${id}`, { method: 'DELETE' })
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
        <h1 className="page-title">Skills</h1>
        <button className="btn btn-primary" onClick={openNew}>Add Skill</button>
      </div>

      {editing && (
        <div className="card form-card">
          <h2 className="card-title">{editing === 'new' ? 'New Skill' : 'Edit Skill'}</h2>
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
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="form-field">
              <span>Model Provider</span>
              <input
                value={form.modelProvider}
                onChange={(e) => setForm({ ...form, modelProvider: e.target.value })}
                placeholder="e.g. openai"
              />
            </label>
            <label className="form-field">
              <span>Model ID</span>
              <input
                value={form.modelId}
                onChange={(e) => setForm({ ...form, modelId: e.target.value })}
                placeholder="e.g. gpt-4o"
              />
            </label>
            <label className="form-field form-field-full">
              <span>Allowed Tools (comma-separated, or "all")</span>
              <input
                value={form.allowedTools}
                onChange={(e) => setForm({ ...form, allowedTools: e.target.value })}
                placeholder='read_file, write_file or "all"'
              />
            </label>
            <label className="form-field form-field-full">
              <span>System Prompt</span>
              <textarea
                rows={5}
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
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
                <th>Description</th>
                <th>Provider / Model</th>
                <th>Tools</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="truncate-cell">{s.description || '—'}</td>
                  <td>
                    {s.modelProvider || s.modelId
                      ? `${s.modelProvider || '?'} / ${s.modelId || '?'}`
                      : '—'}
                  </td>
                  <td>{s.allowedTools.join(', ')}</td>
                  <td className="nowrap">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No skills configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
