import { apiClient } from './client.js'

export const scrapeRecipe = (url) =>
  apiClient('/scrape-recipe', { url })

export const searchRecipes = (search) =>
  apiClient('/search-recipies', { search })

export const getNutrition = (ingredients, servings) =>
  apiClient('/get-nutrition', { ingredients, servings })

export const saveRecipe = (recipe) =>
  apiClient('/save-recipe', { recipe })
