import { useCallback, useState, useEffect } from 'react'
import { usePolling } from '../hooks/usePolling'
import { api } from '../api'

interface SettingsData {
  concurrency: number
  githubConnected: boolean
}

interface ApiKeyRow {
  id: string
  label: string
  prefix: string
  active: boolean
  lastUsedAt: string | null
  createdAt: string
}

export default function Settings() {
  const settingsFetcher = useCallback(() => api<SettingsData>('/settings'), [])
  const keysFetcher = useCallback(() => api<ApiKeyRow[]>('/api-keys'), [])

  const { data: settings, error: settingsError, refresh: refreshSettings } = usePolling(settingsFetcher)
  const { data: keys, error: keysError, refresh: refreshKeys } = usePolling(keysFetcher)

  const [concurrency, setConcurrency] = useState(5)
  const [githubToken, setGithubToken] = useState('')
  const [testingGithub, setTestingGithub] = useState(false)
  const [githubResult, setGithubResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [savingConcurrency, setSavingConcurrency] = useState(false)

  // New API key modal
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [creatingKey, setCreatingKey] = useState(false)

  useEffect(() => {
    if (settings) setConcurrency(settings.concurrency)
  }, [settings])

  const saveConcurrency = async () => {
    setSavingConcurrency(true)
    try {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify({ concurrency }),
      })
      refreshSettings()
    } catch (e) {
      alert(String(e))
    } finally {
      setSavingConcurrency(false)
    }
  }

  const testGithub = async () => {
    setTestingGithub(true)
    setGithubResult(null)
    try {
      await api('/settings/github', {
        method: 'PUT',
        body: JSON.stringify({ token: githubToken }),
      })
      const res = await api<{ connected: boolean; username?: string }>('/settings/github/test')
      setGithubResult({
        ok: res.connected,
        msg: res.connected ? `Connected as ${res.username}` : 'Connection failed',
      })
      setGithubToken('')
      refreshSettings()
    } catch (e) {
      setGithubResult({ ok: false, msg: String(e) })
    } finally {
      setTestingGithub(false)
    }
  }

  const createKey = async () => {
    setCreatingKey(true)
    try {
      const res = await api<{ key: string }>('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label: newKeyLabel }),
      })
      setCreatedKey(res.key)
      refreshKeys()
    } catch (e) {
      alert(String(e))
    } finally {
      setCreatingKey(false)
    }
  }

  const toggleKey = async (id: string, active: boolean) => {
    try {
      await api(`/api-keys/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ active }),
      })
      refreshKeys()
    } catch (e) {
      alert(String(e))
    }
  }

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this API key?')) return
    try {
      await api(`/api-keys/${id}`, { method: 'DELETE' })
      refreshKeys()
    } catch (e) {
      alert(String(e))
    }
  }

  const error = settingsError || keysError
  if (error) return <div className="error-banner">{error}</div>
  if (!settings || !keys) return <div className="loading">Loading...</div>

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <h2 className="card-title">Concurrency</h2>
        <div className="setting-row">
          <div className="slider-group">
            <input
              type="range"
              min={1}
              max={20}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value))}
              className="slider"
            />
            <span className="slider-value">{concurrency}</span>
          </div>
          <button
            className="btn btn-primary"
            onClick={saveConcurrency}
            disabled={savingConcurrency || concurrency === settings.concurrency}
          >
            {savingConcurrency ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">GitHub Token</h2>
        <div className="setting-row">
          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder={settings.githubConnected ? '(connected — enter new token to replace)' : 'ghp_...'}
            className="setting-input"
          />
          <button
            className="btn btn-primary"
            onClick={testGithub}
            disabled={testingGithub || !githubToken}
          >
            {testingGithub ? 'Testing...' : 'Save & Test'}
          </button>
        </div>
        {githubResult && (
          <div className={`test-result ${githubResult.ok ? 'test-ok' : 'test-fail'}`}>
            {githubResult.msg}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header-row">
          <h2 className="card-title">API Keys</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowKeyModal(true)
              setNewKeyLabel('')
              setCreatedKey(null)
            }}
          >
            Create Key
          </button>
        </div>

        {showKeyModal && (
          <div className="modal-overlay" onClick={() => !createdKey && setShowKeyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">
                {createdKey ? 'API Key Created' : 'Create API Key'}
              </h3>
              {createdKey ? (
                <>
                  <p className="modal-text">
                    Copy this key now. It will not be shown again.
                  </p>
                  <div className="key-display">{createdKey}</div>
                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        navigator.clipboard.writeText(createdKey)
                      }}
                    >
                      Copy
                    </button>
                    <button className="btn" onClick={() => setShowKeyModal(false)}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="form-field">
                    <span>Label</span>
                    <input
                      value={newKeyLabel}
                      onChange={(e) => setNewKeyLabel(e.target.value)}
                      placeholder="e.g. CI/CD Pipeline"
                    />
                  </label>
                  <div className="form-actions">
                    <button className="btn" onClick={() => setShowKeyModal(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      onClick={createKey}
                      disabled={creatingKey || !newKeyLabel.trim()}
                    >
                      {creatingKey ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Prefix</th>
                <th>Active</th>
                <th>Last Used</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td><code className="key-prefix">{k.prefix}...</code></td>
                  <td>
                    <button
                      className={`toggle-btn ${k.active ? 'toggle-on' : 'toggle-off'}`}
                      onClick={() => toggleKey(k.id, !k.active)}
                    >
                      {k.active ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td className="nowrap">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : 'Never'}</td>
                  <td className="nowrap">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button className="btn btn-sm btn-danger" onClick={() => deleteKey(k.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {keys.length === 0 && (
                <tr><td colSpan={6} className="empty-row">No API keys</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
