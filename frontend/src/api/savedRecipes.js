import { apiClient, apiGet, apiDelete } from './client.js'

export const listSavedRecipes = () => apiGet('/saved-recipes')
export const createSavedRecipe = (recipe) => apiClient('/saved-recipes', { recipe })
export const deleteSavedRecipe = (id) => apiDelete(`/saved-recipes/${id}`)
