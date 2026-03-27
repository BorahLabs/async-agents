import { useCallback, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'

interface Skill {
  name: string
  description: string
  systemPrompt: string
  createdAt: string
}

interface ImportResult {
  imported: string[]
  skipped: string[]
  errors: string[]
  total: number
}

const emptyForm = {
  name: '',
  description: '',
  systemPrompt: '',
}

export default function Skills() {
  const fetcher = useCallback(() => adminApi<Skill[]>('/skills'), [])
  const { data, error, refresh } = usePolling(fetcher)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')

  const openNew = () => {
    setEditing('new')
    setForm(emptyForm)
    setFormError('')
  }

  const openEdit = (s: Skill) => {
    setEditing(s.name)
    setForm({
      name: s.name,
      description: s.description || '',
      systemPrompt: s.systemPrompt,
    })
    setFormError('')
  }

  const save = async () => {
    setSaving(true)
    setFormError('')
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        system_prompt: form.systemPrompt,
      }
      if (editing === 'new') {
        await adminApi('/skills', { method: 'POST', body: JSON.stringify(body) })
      } else {
        await adminApi(`/skills/${editing}`, { method: 'PUT', body: JSON.stringify(body) })
      }
      setEditing(null)
      refresh()
    } catch (e) {
      setFormError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (name: string) => {
    if (!confirm('Delete this skill?')) return
    try {
      await adminApi(`/skills/${name}`, { method: 'DELETE' })
      refresh()
    } catch (e) {
      alert(String(e))
    }
  }

  const runImport = async () => {
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const result = await adminApi<ImportResult>('/skills/import', {
        method: 'POST',
        body: JSON.stringify({ url: importUrl }),
      })
      setImportResult(result)
      refresh()
    } catch (e) {
      setImportError(String(e))
    } finally {
      setImporting(false)
    }
  }

  const closeImport = () => {
    setShowImport(false)
    setImportUrl('')
    setImportResult(null)
    setImportError('')
  }

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <div className="loading">Loading...</div>

  return (
    <div className="page">
      <div className="page-header-row">
        <h1 className="page-title">Skills</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => { setShowImport(true); setImportResult(null); setImportError('') }}>
            Import from GitHub
          </button>
          <button className="btn btn-primary" onClick={openNew}>Add Skill</button>
        </div>
      </div>

      {showImport && (
        <div className="card form-card">
          <h2 className="card-title">Import Skills from GitHub</h2>
          <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem' }}>
            Paste a GitHub repository URL. The importer will look for a <code>skills/</code> folder
            containing subdirectories with <code>SKILL.md</code> files.
          </p>
          {importError && <div className="form-error">{importError}</div>}
          <div className="form-grid">
            <label className="form-field form-field-full">
              <span>GitHub URL</span>
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://github.com/owner/repo or https://github.com/owner/repo/tree/main/plugins/my-plugin"
              />
            </label>
          </div>

          {importResult && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ color: '#22c55e', marginBottom: '0.5rem', fontWeight: 600 }}>
                Imported {importResult.imported.length} of {importResult.total} skills
              </div>
              {importResult.imported.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#e1e4eb', fontSize: '0.8rem' }}>Imported:</strong>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                    {importResult.imported.map((s) => <li key={s}>{s}</li>)}
                  </ul>
                </div>
              )}
              {importResult.skipped.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ color: '#f59e0b', fontSize: '0.8rem' }}>Skipped:</strong>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                    {importResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
              {importResult.errors.length > 0 && (
                <div>
                  <strong style={{ color: '#ef4444', fontSize: '0.8rem' }}>Errors:</strong>
                  <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                    {importResult.errors.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button className="btn" onClick={closeImport}>
              {importResult ? 'Done' : 'Cancel'}
            </button>
            {!importResult && (
              <button
                className="btn btn-primary"
                onClick={runImport}
                disabled={importing || !importUrl.trim()}
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            )}
          </div>
        </div>
      )}

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
                disabled={editing !== 'new'}
              />
            </label>
            <label className="form-field form-field-full">
              <span>Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="form-field form-field-full">
              <span>System Prompt</span>
              <textarea
                rows={8}
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="truncate-cell">{s.description || '—'}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(s.name)}>Delete</button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={3} className="empty-row">No skills configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
