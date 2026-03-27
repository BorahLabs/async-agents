export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function adminApi<T>(path: string, options?: RequestInit): Promise<T> {
  return api<T>(`/admin${path}`, options)
}
