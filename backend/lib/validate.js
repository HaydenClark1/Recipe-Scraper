const MAX_URL_LENGTH = 2048
const MAX_INGREDIENTS = 200
const MAX_INGREDIENT_LENGTH = 1000
const MAX_QUERY_LENGTH = 200
const MIN_QUERY_LENGTH = 2

function badRequest(message) {
  const e = new Error(message)
  e.status = 400
  return e
}

function validateUrl(url) {
  if (typeof url !== 'string') throw badRequest('url is required')
  const trimmed = url.trim()
  if (!trimmed) throw badRequest('url is required')
  if (trimmed.length > MAX_URL_LENGTH) throw badRequest('url is too long')
  return trimmed
}

function validateIngredients(ingredients) {
  if (!Array.isArray(ingredients)) throw badRequest('ingredients must be an array')
  if (ingredients.length > MAX_INGREDIENTS) throw badRequest(`too many ingredients (max ${MAX_INGREDIENTS})`)
  for (const item of ingredients) {
    if (typeof item !== 'string') throw badRequest('invalid ingredient entry')
    if (item.length > MAX_INGREDIENT_LENGTH) throw badRequest('an ingredient line is too long')
  }
  return ingredients
}

function validateQuery(q) {
  const trimmed = (q == null ? '' : String(q)).trim()
  if (trimmed.length < MIN_QUERY_LENGTH) throw badRequest('query too short')
  if (trimmed.length > MAX_QUERY_LENGTH) throw badRequest('query too long')
  return trimmed
}

module.exports = {
  validateUrl, validateIngredients, validateQuery,
  MAX_URL_LENGTH, MAX_INGREDIENTS, MAX_INGREDIENT_LENGTH, MAX_QUERY_LENGTH,
}
