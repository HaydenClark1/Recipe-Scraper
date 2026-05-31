const cheerio = require('cheerio')

function findRecipeLike(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findRecipeLike(item)
      if (r) return r
    }
  } else if (obj && typeof obj === 'object') {
    const type = obj['@type']
    if (typeof type === 'string' && type.toLowerCase().includes('recipe')) return obj
    if (Array.isArray(type) && type.some((t) => typeof t === 'string' && t.toLowerCase().includes('recipe'))) return obj
    for (const key of Object.keys(obj)) {
      const r = findRecipeLike(obj[key])
      if (r) return r
    }
  }
  return null
}

function extractFromJsonLd($) {
  const scripts = $('script[type="application/ld+json"]').toArray()
  for (const el of scripts) {
    try {
      const parsed = JSON.parse($(el).html())
      const found = findRecipeLike(parsed)
      if (found) return found
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null
}

function extractImage($, recipe) {
  const img = recipe && recipe.image
  let url = null
  if (Array.isArray(img)) {
    for (const item of img) {
      if (typeof item === 'string' && item) { url = item; break }
      if (item && typeof item === 'object' && item.url) { url = item.url; break }
    }
  } else if (img && typeof img === 'object') {
    url = img.url || null
  } else if (typeof img === 'string') {
    url = img
  }
  if (!url) url = $('meta[property="og:image"]').attr('content') || null
  return url || null
}

function extractFromDom($) {
  const ingredients = []
  $('.wprm-recipe-ingredient, .tasty-recipes-ingredients li').each((_, el) => {
    const t = $(el).text().trim()
    if (t) ingredients.push(t)
  })
  const instructions = []
  $('.wprm-recipe-instruction-text, .tasty-recipes-instructions li').each((_, el) => {
    const t = $(el).text().trim()
    if (t) instructions.push(t)
  })
  if (!ingredients.length && !instructions.length) return null
  const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || ''
  return { name, recipeIngredient: ingredients, recipeInstructions: instructions }
}

function extractFromMicrodata($) {
  const scope = $('[itemtype~="https://schema.org/Recipe"],[itemtype~="http://schema.org/Recipe"]').first()
  if (!scope.length) return null
  const textOf = (prop) => scope.find(`[itemprop="${prop}"]`).map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const name = scope.find('[itemprop="name"]').filter((_, el) => {
    return $(el).closest('[itemscope]').is(scope)
  }).first().text().trim()
  const recipeIngredient = textOf('recipeIngredient')
  const recipeInstructions = textOf('recipeInstructions')
  if (!recipeIngredient.length && !recipeInstructions.length) return null
  return {
    name,
    recipeIngredient,
    recipeInstructions,
    prepTime: scope.find('[itemprop="prepTime"]').first().attr('content') || null,
    totalTime: scope.find('[itemprop="totalTime"]').first().attr('content') || null,
    recipeYield: scope.find('[itemprop="recipeYield"]').first().text().trim() || null,
  }
}

function extractRecipe(html) {
  const $ = cheerio.load(html)
  const recipe = extractFromJsonLd($) || extractFromMicrodata($) || extractFromDom($)
  if (!recipe) return null
  const image = extractImage($, recipe)
  return { recipe, image }
}

module.exports = {
  findRecipeLike, extractFromJsonLd, extractImage,
  extractFromDom, extractFromMicrodata, extractRecipe,
}
