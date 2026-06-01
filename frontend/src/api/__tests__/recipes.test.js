import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as client from '../client.js'

vi.mock('../client.js', () => ({
  apiClient: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('scrapeRecipe', () => {
  it('calls /scrape-recipe with the url', async () => {
    client.apiClient.mockResolvedValue({ title: 'Cake' })
    const { scrapeRecipe } = await import('../recipes.js')
    await scrapeRecipe('https://example.com')
    expect(client.apiClient).toHaveBeenCalledWith('/scrape-recipe', { url: 'https://example.com' })
  })
})

describe('searchRecipes', () => {
  it('calls /search-recipies with the search term', async () => {
    client.apiClient.mockResolvedValue({ recipes: [] })
    const { searchRecipes } = await import('../recipes.js')
    await searchRecipes('pasta')
    expect(client.apiClient).toHaveBeenCalledWith('/search-recipies', { search: 'pasta' })
  })
})

describe('saveRecipe', () => {
  it('calls /save-recipe with recipe object', async () => {
    client.apiClient.mockResolvedValue({ message: 'Recipe saved' })
    const { saveRecipe } = await import('../recipes.js')
    const recipe = { title: 'Soup', ingredients: [] }
    await saveRecipe(recipe)
    expect(client.apiClient).toHaveBeenCalledWith('/save-recipe', { recipe })
  })
})

describe('getNutrition', () => {
  it('calls /get-nutrition with ingredients and servings', async () => {
    client.apiClient.mockResolvedValue({ totals: {} })
    const { getNutrition } = await import('../recipes.js')
    await getNutrition(['2 cups flour'], '4')
    expect(client.apiClient).toHaveBeenCalledWith('/get-nutrition', { ingredients: ['2 cups flour'], servings: '4' })
  })
})
