import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))
import { Preferences } from '@capacitor/preferences'
import { apiClient, apiGet, apiDelete } from '../client.js'

beforeEach(() => {
  vi.restoreAllMocks()
  Preferences.get.mockResolvedValue({ value: null })
})

describe('apiClient', () => {
  it('POSTs JSON and returns parsed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ title: 'Pasta' }) })
    vi.stubGlobal('fetch', mockFetch)
    const result = await apiClient('/scrape-recipe', { url: 'https://x.com' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/scrape-recipe$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://x.com' }) })
    )
    expect(result).toEqual({ title: 'Pasta' })
  })

  it('attaches a bearer token when one is stored', async () => {
    Preferences.get.mockResolvedValue({ value: 'tok123' })
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', mockFetch)
    await apiClient('/saved-recipes', {})
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123')
  })

  it('clears the token on a 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'nope' }) })
    vi.stubGlobal('fetch', mockFetch)
    await expect(apiClient('/saved-recipes', {})).rejects.toMatchObject({ status: 401 })
    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'auth-token' })
  })

  it('throws with status and message on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Recipe not found' }) })
    vi.stubGlobal('fetch', mockFetch)
    await expect(apiClient('/scrape-recipe', { url: 'x' })).rejects.toMatchObject({ message: 'Recipe not found', status: 404 })
  })

  it('apiGet issues a GET and apiDelete issues a DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ recipes: [] }) })
    vi.stubGlobal('fetch', mockFetch)
    await apiGet('/saved-recipes')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
    await apiDelete('/saved-recipes/3')
    expect(mockFetch.mock.calls[1][1].method).toBe('DELETE')
  })
})
