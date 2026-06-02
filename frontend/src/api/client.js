import { Preferences } from '@capacitor/preferences'

const BASE_URL = import.meta.env?.VITE_API_URL ?? 'https://recipe-scraper-hk6l.onrender.com'
const TOKEN_KEY = 'auth-token'

export async function getToken() {
  const { value } = await Preferences.get({ key: TOKEN_KEY })
  return value || null
}
export async function setToken(token) {
  await Preferences.set({ key: TOKEN_KEY, value: token })
}
export async function clearToken() {
  await Preferences.remove({ key: TOKEN_KEY })
}

async function request(path, { method = 'POST', body } = {}) {
  const token = await getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    await clearToken()
    if (typeof window !== 'undefined') window.location.hash = '#/login'
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.message || data.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// Backward-compatible POST helper (existing callers use apiClient(path, body)).
export const apiClient = (path, body) => request(path, { method: 'POST', body })
export const apiGet = (path) => request(path, { method: 'GET' })
export const apiDelete = (path) => request(path, { method: 'DELETE' })
