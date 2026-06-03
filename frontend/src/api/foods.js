import { apiGet } from './client.js'

export const searchFoods = (q) => apiGet(`/search-foods?q=${encodeURIComponent(q)}`)
