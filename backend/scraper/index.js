const { extractRecipe } = require('./extract')
const { fetchHtml } = require('./fetch')
const N = require('./normalize')

function toCleanArray(v) {
  if (v == null) return []
  return (Array.isArray(v) ? v : [v]).map(N.cleanText).filter(Boolean)
}

function assembleRecipe(html) {
  const extracted = extractRecipe(html)
  if (!extracted) return null
  const r = extracted.recipe
  return {
    title: N.cleanText(r.name) || 'N/A',
    ingredients: N.normalizeIngredients(r.recipeIngredient),
    prepTime: N.humanizeDuration(r.prepTime) || 'N/A',
    totalTime: N.humanizeDuration(r.totalTime) || 'N/A',
    servings: N.normalizeYield(r.recipeYield) || 'N/A',
    category: toCleanArray(r.recipeCategory),
    cuisine: toCleanArray(r.recipeCuisine),
    instructions: N.normalizeInstructions(r.recipeInstructions),
    image: extracted.image || null,
  }
}

async function scrapeRecipe(url) {
  const html = await fetchHtml(url)
  return assembleRecipe(html)
}

module.exports = { assembleRecipe, scrapeRecipe }
