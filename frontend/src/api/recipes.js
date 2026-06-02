import { apiClient } from './client.js'

export const scrapeRecipe = (url) =>
  apiClient('/scrape-recipe', { url })

export const searchRecipes = (search) =>
  apiClient('/search-recipies', { search })

export const getNutrition = (ingredients, servings, overrides) =>
  apiClient('/get-nutrition', { ingredients, servings, overrides })

export const saveRecipe = (recipe) =>
  apiClient('/save-recipe', { recipe })
