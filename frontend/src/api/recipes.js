import { apiClient } from './client.js'

export const scrapeRecipe = (url) =>
  apiClient('/scrape-recipe', { url })

export const searchRecipes = (search) =>
  apiClient('/search-recipies', { search })

export const getNutrition = (ingredients) =>
  apiClient('/get-nutrition', { ingredients })

export const parseIngredients = (ingredients) =>
  apiClient('/parse-ingredients-api', { ingredients })

export const saveRecipe = (recipe) =>
  apiClient('/save-recipe', { recipe })
