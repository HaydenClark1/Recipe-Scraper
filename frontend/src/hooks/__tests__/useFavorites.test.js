import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFavorites } from '../useFavorites.js'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { Preferences } from '@capacitor/preferences'

beforeEach(() => {
  vi.clearAllMocks()
  Preferences.get.mockResolvedValue({ value: null })
  Preferences.set.mockResolvedValue(undefined)
})

const recipe = { id: '123', title: 'Soup', image: null, source: 'scrape', ingredients: [], instructions: [], prepTime: null, totalTime: null, servings: null, category: [], cuisine: [] }

describe('useFavorites', () => {
  it('initializes with empty favorites', async () => {
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toEqual([]))
  })

  it('loads existing favorites from Preferences on mount', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
  })

  it('addFavorite adds a recipe and persists it', async () => {
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toEqual([]))
    await act(async () => { await result.current.addFavorite(recipe) })
    expect(result.current.favorites).toHaveLength(1)
    expect(result.current.favorites[0].source).toBe('favorite')
    expect(Preferences.set).toHaveBeenCalled()
  })

  it('removeFavorite removes by id and persists', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    await act(async () => { await result.current.removeFavorite('123') })
    expect(result.current.favorites).toHaveLength(0)
    expect(Preferences.set).toHaveBeenCalled()
  })

  it('isFavorite returns true for saved id, false otherwise', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    expect(result.current.isFavorite('123')).toBe(true)
    expect(result.current.isFavorite('999')).toBe(false)
  })
})
