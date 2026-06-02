import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as client from '../client.js'

vi.mock('../client.js', () => ({
  apiClient: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('auth api', () => {
  it('signup posts to /auth/signup', async () => {
    client.apiClient.mockResolvedValue({ token: 't' })
    const { signup } = await import('../auth.js')
    await signup('a@b.com', 'pw')
    expect(client.apiClient).toHaveBeenCalledWith('/auth/signup', { email: 'a@b.com', password: 'pw' })
  })

  it('login posts to /auth/login', async () => {
    client.apiClient.mockResolvedValue({ token: 't' })
    const { login } = await import('../auth.js')
    await login('a@b.com', 'pw')
    expect(client.apiClient).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pw' })
  })
})

describe('savedRecipes api', () => {
  it('listSavedRecipes GETs /saved-recipes', async () => {
    client.apiGet.mockResolvedValue({ recipes: [] })
    const { listSavedRecipes } = await import('../savedRecipes.js')
    await listSavedRecipes()
    expect(client.apiGet).toHaveBeenCalledWith('/saved-recipes')
  })

  it('createSavedRecipe POSTs the recipe', async () => {
    client.apiClient.mockResolvedValue({ recipe: {} })
    const { createSavedRecipe } = await import('../savedRecipes.js')
    const recipe = { title: 'X' }
    await createSavedRecipe(recipe)
    expect(client.apiClient).toHaveBeenCalledWith('/saved-recipes', { recipe })
  })

  it('deleteSavedRecipe DELETEs by id', async () => {
    client.apiDelete.mockResolvedValue(null)
    const { deleteSavedRecipe } = await import('../savedRecipes.js')
    await deleteSavedRecipe(3)
    expect(client.apiDelete).toHaveBeenCalledWith('/saved-recipes/3')
  })
})
