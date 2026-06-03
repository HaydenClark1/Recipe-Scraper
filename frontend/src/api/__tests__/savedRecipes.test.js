import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSavedRecipe, updateRecipe } from '../savedRecipes.js'

describe('savedRecipes api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ recipe: {} }) })
  })
  it('createSavedRecipe posts the recipe document', async () => {
    await createSavedRecipe({ title: 'T', ingredientsData: [{ id: 'a', text: 'x', nutrition: null }], instructions: ['s'] })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/saved-recipes')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).recipe.ingredientsData[0].text).toBe('x')
  })
  it('updateRecipe PUTs to the recipe id', async () => {
    await updateRecipe(5, { title: 'T', ingredientsData: [], instructions: [] })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/saved-recipes/5')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body).recipe.title).toBe('T')
  })
})
