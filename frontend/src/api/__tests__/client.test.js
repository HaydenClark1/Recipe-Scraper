import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../client.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('apiClient', () => {
  it('POSTs JSON to the correct URL and returns parsed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Pasta' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await apiClient('/scrape-recipe', { url: 'https://x.com' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/scrape-recipe$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.com' }),
      })
    )
    expect(result).toEqual({ title: 'Pasta' })
  })

  it('throws with status and message on non-2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Recipe not found' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(apiClient('/scrape-recipe', { url: 'x' })).rejects.toMatchObject({
      message: 'Recipe not found',
      status: 404,
    })
  })

  it('throws with HTTP status string when body has no message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(apiClient('/x', {})).rejects.toMatchObject({
      message: 'HTTP 500',
    })
  })
})
