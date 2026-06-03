import { apiGet } from './client.js'

export const searchFoods = (q, source) =>
  apiGet(`/search-foods?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`)
