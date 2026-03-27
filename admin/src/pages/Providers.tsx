import { useCallback, useEffect, useState } from 'react'
import { usePolling } from '../hooks/usePolling'
import { adminApi } from '../api'

// --- Types ---

interface ProviderInfo {
  id: string
  name: string
  authType: 'api_key' | 'oauth' | 'env_vars' | 'custom'
  envVars?: Array<{ key: string; label: string; required: boolean; placeholder?: string }>
  baseUrl?: string
  description?: string
}

interface ProviderRaw {
  id: string
  name: string
  type: string
  base_url: string | null
  api_key: string
  models: string | null
  env_vars: string | null
  created_at: string
  updated_at: string
}

interface Provider {
  id: string
  name: string
  type: string
  baseUrl: string
  models: string[]
  envVars: Record<string, string>
  createdAt: string
}

// --- Helpers ---

function parseProvider(p: ProviderRaw): Provider {
  let models: string[] = []
  if (p.models) {
    try { models = JSON.parse(p.models) as string[] } catch { models = [] }
  }
  let envVars: Record<string, string> = {}
  if (p.env_vars) {
    try { envVars = JSON.parse(p.env_vars) as Record<string, string> } catch { envVars = {} }
  }
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.base_url || '',
    models,
    envVars,
    createdAt: p.created_at,
  }
}

const POPULAR_IDS = ['openai', 'anthropic', 'google-generative-ai', 'openrouter', 'deepseek', 'mistral', 'groq', 'xai']

function isCloudProvider(id: string): boolean {
  return (
    id === 'amazon-bedrock' ||
    id === 'azure' ||
    id === 'google-vertex-ai' ||
    id === 'sap-ai-core' ||
    id.startsWith('cloudflare-')
  )
}

interface ProviderGroup {
  label: string
  items: ProviderInfo[]
}

function groupProviders(registry: ProviderInfo[]): ProviderGroup[] {
  const popular: ProviderInfo[] = []
  const cloud: ProviderInfo[] = []
  const others: ProviderInfo[] = []

  const popularSet = new Set(POPULAR_IDS)

  for (const p of registry) {
    if (popularSet.has(p.id)) {
      popular.push(p)
    } else if (isCloudProvider(p.id)) {
      cloud.push(p)
    } else {
      others.push(p)
    }
  }

  // Sort popular by the predefined order
  popular.sort((a, b) => POPULAR_IDS.indexOf(a.id) - POPULAR_IDS.indexOf(b.id))
  cloud.sort((a, b) => a.name.localeCompare(b.name))
  others.sort((a, b) => a.name.localeCompare(b.name))

  const groups: ProviderGroup[] = []
  if (popular.length > 0) groups.push({ label: 'Popular', items: popular })
  if (cloud.length > 0) groups.push({ label: 'Cloud Providers', items: cloud })
  if (others.length > 0) groups.push({ label: 'All Others', items: others })
  return groups
}

function registryLookup(registry: ProviderInfo[], id: string): ProviderInfo | undefined {
  return registry.find((p) => p.id === id)
}

// --- Form state ---

interface FormState {
  name: string
  type: string
  baseUrl: string
  apiKey: string
  models: string
  envVars: Record<string, string>
}

const emptyForm: FormState = { name: '', type: 'openai', baseUrl: '', apiKey: '', models: '', envVars: {} }

// --- Component ---

export default function Providers() {
  const [registry, setRegistry] = useState<ProviderInfo[]>([])
  const [registryError, setRegistryError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi<ProviderInfo[]>('/providers/registry')
      .then((data) => { if (!cancelled) setRegistry(data) })
      .catch((e) => { if (!cancelled) setRegistryError(String(e)) })
    return () => { cancelled = true }
  }, [])

  const fetcher = useCallback(async () => {
    const raw = await adminApi<ProviderRaw[]>('/providers')
    return raw.map(parseProvider)
  }, [])
  const { data, error, refresh } = usePolling(fetcher)

  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const groups = groupProviders(registry)
  const selectedProvider = registryLookup(registry, form.type)

  const showApiKey = selectedProvider
    ? selectedProvider.authType !== 'oauth' && selectedProvider.authType !== 'custom'
    : true
  const baseUrlRequired = selectedProvider?.authType === 'custom'

  const openNew = () => {
    const initial = registry.length > 0 ? registry[0]!.id : 'openai'
    const info = registryLookup(registry, initial)
    setEditing('new')
    setForm({
      ...emptyForm,
      type: initial,
      baseUrl: info?.baseUrl ?? '',
      envVars: {},
    })
    setFormError('')
  }

  const openEdit = (p: Provider) => {
    const info = registryLookup(registry, p.type)
    setEditing(p.id)
    setForm({
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl || info?.baseUrl || '',
      apiKey: '',
      models: p.models.join(', '),
      envVars: { ...p.envVars },
    })
    setFormError('')
  }

  const handleTypeChange = (newType: string) => {
    const info = registryLookup(registry, newType)
    setForm((prev) => ({
      ...prev,
      type: newType,
      baseUrl: info?.baseUrl ?? '',
      envVars: {},
    }))
  }

  const setEnvVar = (key: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      envVars: { ...prev.envVars, [key]: value },
    }))
  }

  const save = async () => {
    setSaving(true)
    setFormError('')
    try {
      const envVarsPayload: Record<string, string> = {}
      if (selectedProvider?.envVars) {
        for (const ev of selectedProvider.envVars) {
          const val = form.envVars[ev.key]
          if (val) {
            envVarsPayload[ev.key] = val
          }
        }
      }

      const body = {
        name: form.name,
        type: form.type,
        api_key: form.apiKey || undefined,
        base_url: form.baseUrl || undefined,
        models: form.models.split(',').map((m) => m.trim()).filter(Boolean),
        env_vars: Object.keys(envVarsPayload).length > 0 ? envVarsPayload : undefined,
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

  const displayName = (typeId: string): string => {
    const info = registryLookup(registry, typeId)
    return info?.name ?? typeId
  }

  if (registryError) return <div className="error-banner">Failed to load provider registry: {registryError}</div>
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
                onChange={(e) => handleTypeChange(e.target.value)}
              >
                {groups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.items.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {selectedProvider?.description && (
              <div className="form-field form-field-full">
                <span className="form-hint">{selectedProvider.description}</span>
              </div>
            )}

            {showApiKey && (
              <label className="form-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={editing !== 'new' ? '(unchanged)' : ''}
                />
              </label>
            )}

            <label className="form-field">
              <span>Base URL{baseUrlRequired ? ' (required)' : ''}</span>
              <input
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder={selectedProvider?.baseUrl || 'https://api.example.com/v1'}
                required={baseUrlRequired}
              />
            </label>

            <label className="form-field form-field-full">
              <span>Models (comma-separated)</span>
              <input
                value={form.models}
                onChange={(e) => setForm({ ...form, models: e.target.value })}
                placeholder="model-1, model-2"
              />
            </label>

            {selectedProvider?.envVars && selectedProvider.envVars.length > 0 && (
              selectedProvider.envVars.map((ev) => (
                <label key={ev.key} className="form-field">
                  <span>{ev.label}{ev.required ? ' *' : ''}</span>
                  <input
                    value={form.envVars[ev.key] ?? ''}
                    onChange={(e) => setEnvVar(ev.key, e.target.value)}
                    placeholder={editing !== 'new' && form.envVars[ev.key] !== undefined && form.envVars[ev.key] !== ''
                      ? '(unchanged)'
                      : ev.placeholder ?? ''}
                    required={ev.required}
                  />
                </label>
              ))
            )}
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
                  <td><span className="type-tag">{displayName(p.type)}</span></td>
                  <td className="truncate-cell">{p.baseUrl || '\u2014'}</td>
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
