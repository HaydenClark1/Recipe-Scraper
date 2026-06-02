import { apiClient, apiGet, apiDelete, apiPut } from './client.js'

export const listSavedRecipes = () => apiGet('/saved-recipes')
export const createSavedRecipe = (recipe, overrides) => apiClient('/saved-recipes', { recipe, overrides })
export const deleteSavedRecipe = (id) => apiDelete(`/saved-recipes/${id}`)
export const updateOverrides = (id, overrides) => apiPut(`/saved-recipes/${id}/overrides`, { overrides })
