import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../api/savedRecipes.js', () => ({
  listSavedRecipes: vi.fn(),
  createSavedRecipe: vi.fn(),
  deleteSavedRecipe: vi.fn(),
}))
import * as api from '../../api/savedRecipes.js'
import { useSavedRecipes } from '../useSavedRecipes.js'

const saved = { id: 1, title: 'Soup', sourceUrl: null, ingredients: [], instructions: [] }

beforeEach(() => {
  vi.clearAllMocks()
  api.listSavedRecipes.mockResolvedValue({ recipes: [] })
})

describe('useSavedRecipes', () => {
  it('loads the list on mount', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
  })

  it('add posts and appends the saved recipe', async () => {
    api.createSavedRecipe.mockResolvedValue({ recipe: saved })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toEqual([]))
    await act(async () => { await result.current.add({ title: 'Soup' }, []) })
    expect(api.createSavedRecipe).toHaveBeenCalledWith({ title: 'Soup' }, [])
    expect(result.current.list).toHaveLength(1)
  })

  it('remove deletes by id and drops it from the list', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    api.deleteSavedRecipe.mockResolvedValue(null)
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.remove(1) })
    expect(api.deleteSavedRecipe).toHaveBeenCalledWith(1)
    expect(result.current.list).toHaveLength(0)
  })

  it('findSaved matches by title and isSaved reflects it', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    expect(result.current.isSaved({ title: 'Soup' })).toBe(true)
    expect(result.current.isSaved({ title: 'Other' })).toBe(false)
    expect(result.current.findSaved({ title: 'Soup' }).id).toBe(1)
  })
})
