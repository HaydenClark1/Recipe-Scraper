const crypto = require('crypto')

function normalizeOverride(o) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
}

function nutritionSignature({ ingredients = [], overrides = [], servings = null }) {
  const canonical = {
    ingredients: (ingredients || []).map((s) => String(s).replace(/\s+/g, ' ').trim()),
    overrides: (overrides || []).map(normalizeOverride).sort((a, b) => a.index - b.index || 0),
    servings: servings ?? null,
  }
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

module.exports = { nutritionSignature }
