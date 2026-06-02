const Fuse = require('fuse.js')

// USDA macros are stored per 100g; emit the same string shape FatSecret returns
// so parseFoodDescription can read it unchanged.
function formatDescription(food) {
  const n = (v) => (v == null ? 0 : v)
  return `Per 100g - Calories: ${n(food.calories)}kcal | Fat: ${n(food.fat)}g | Carbs: ${n(food.carbs)}g | Protein: ${n(food.protein)}g`
}

function buildIndex(foods) {
  return new Fuse(foods, {
    keys: ['description'],
    threshold: 0.2,        // tighter — reduces false matches like "salt" → "Butter, salted"
    ignoreLocation: true,
    minMatchCharLength: 3, // prevents single/double char queries matching random entries
  })
}

// makeUsdaSearch(index, foods) — four-tier lookup to handle USDA naming conventions.
function makeUsdaSearch(index, foods) {
  const toResult = (food) => ({
    food_name: food.description,
    food_description: formatDescription(food),
  })

  // Skip entries with 0/null calories unless the search term itself is a zero-cal food
  const hasCalories = (food) => food.calories != null && food.calories > 0
  const isZeroCalFood = (name) => /^(salt|water|vinegar|soda water|club soda)/i.test(name)

  return async function searchFood(name) {
    if (!name || name.trim().length < 2) return null
    const lower = name.toLowerCase().trim()
    const words = lower.split(/\s+/).filter((w) => w.length >= 3)

    // Tier 1: exact primary name match (case-insensitive)
    const exact = foods.find((f) => f.description.split(',')[0].toLowerCase() === lower)
    if (exact) return toResult(exact)

    // Tier 2: primary name starts with the full search term — prefer shortest match
    // (avoids "Butter replacement" ranking above "Butter, with salt" for "butter")
    const prefixCandidates = foods.filter((f) => {
      const primary = f.description.split(',')[0].toLowerCase()
      return primary.startsWith(lower + ' ') || primary.startsWith(lower + ',')
    })
    prefixCandidates.sort((a, b) =>
      a.description.split(',')[0].length - b.description.split(',')[0].length
    )
    const prefixMatch = prefixCandidates.find((f) => isZeroCalFood(lower) || hasCalories(f))
    if (prefixMatch) return toResult(prefixMatch)

    // Tier 3: the food's first segment (its actual name) contains a search word AND every
    // search word appears somewhere in the description. Handles word-order inversions like
    // "olive oil" → "Oil, olive, salad or cooking" while rejecting "Mayonnaise, ..., with
    // olive oil" (first segment "mayonnaise" contains neither "olive" nor "oil").
    if (words.length >= 2) {
      const wordMatch = foods.find((f) => {
        if (!isZeroCalFood(lower) && !hasCalories(f)) return false
        const desc = f.description.toLowerCase()
        const firstSeg = desc.split(',')[0]
        const firstSegHasWord = words.some((w) => firstSeg.includes(w))
        return firstSegHasWord && words.every((w) => desc.includes(w))
      })
      if (wordMatch) return toResult(wordMatch)
    }

    // Tier 4: Fuse fuzzy fallback — skip 0-cal results unless zero-cal food
    const hits = index.search(name)
    const hit = hits.find((h) => isZeroCalFood(lower) || hasCalories(h.item))
    if (hit) return toResult(hit.item)

    return null
  }
}

async function loadFoods(prisma) {
  return prisma.food.findMany()
}

module.exports = { formatDescription, buildIndex, makeUsdaSearch, loadFoods }
