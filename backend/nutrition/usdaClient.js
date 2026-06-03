const Fuse = require('fuse.js')
const { scoreCandidate, MIN_SCORE } = require('./scoreFood')

// USDA macros are stored per 100g; emit the same string shape FatSecret returns
// so parseFoodDescription can read it unchanged.
function formatDescription(food) {
  const n = (v) => (v == null ? 0 : v)
  return `Per 100g - Calories: ${n(food.calories)}kcal | Fat: ${n(food.fat)}g | Carbs: ${n(food.carbs)}g | Protein: ${n(food.protein)}g`
}

function buildIndex(foods) {
  return new Fuse(foods, {
    keys: ['description'],
    threshold: 0.2,
    ignoreLocation: true,
    minMatchCharLength: 3,
    includeScore: true,
  })
}

const POOL_LIMIT = 25

// Build a bounded candidate shortlist:
//   Fuse top-N ∪ exact/prefix primary matches ∪ all-words-in-description matches
// Returns Array of { item, fuseScore } so callers can use fuseScore as a tiebreaker.
function buildPool(index, foods, name) {
  const lower = name.toLowerCase().trim()
  const words = lower.split(/\s+/).filter((w) => w.length >= 2)
  const fuseHits = index.search(name).slice(0, POOL_LIMIT)
  const seen = new Set(fuseHits.map((h) => h.item.fdcId))

  const pool = fuseHits.map((h) => ({ item: h.item, fuseScore: h.score || 0 }))

  // Exact/prefix primary-segment matches (force-included regardless of Fuse rank)
  for (const f of foods) {
    if (seen.has(f.fdcId)) continue
    const primary = f.description.split(',')[0].toLowerCase()
    if (
      primary === lower ||
      primary.startsWith(lower + ' ') ||
      primary.startsWith(lower + ',')
    ) {
      pool.push({ item: f, fuseScore: 1 })
      seen.add(f.fdcId)
    }
  }

  // Word-set matches: every query word appears somewhere in the description
  // (handles word-order inversions like "olive oil" → "Oil, olive, salad or cooking")
  if (words.length >= 2) {
    for (const f of foods) {
      if (seen.has(f.fdcId)) continue
      const desc = f.description.toLowerCase()
      if (words.every((w) => desc.includes(w))) {
        pool.push({ item: f, fuseScore: 1 })
        seen.add(f.fdcId)
      }
    }
  }

  return pool
}

// makeUsdaSearch(index, foods) — score all candidates, return the best fit.
function makeUsdaSearch(index, foods) {
  const toResult = (food) => ({
    food_name: food.description,
    food_description: formatDescription(food),
  })

  const hasCalories = (food) => food.calories != null && food.calories > 0
  const isZeroCalFood = (name) => /^(salt|water|vinegar|soda water|club soda)/i.test(name)

  return async function searchFood(name) {
    if (!name || name.trim().length < 2) return null
    const lower = name.toLowerCase().trim()

    const pool = buildPool(index, foods, name)
    const filtered = pool.filter(({ item }) => isZeroCalFood(lower) || hasCalories(item))
    if (!filtered.length) return null

    // Score all candidates; use fuseScore as tiebreaker (lower fuse score = better match)
    let best = null
    let bestScore = -Infinity
    for (const { item, fuseScore } of filtered) {
      const s = scoreCandidate(lower, item) - fuseScore * 0.5
      if (s > bestScore) {
        bestScore = s
        best = item
      }
    }

    if (best && bestScore >= MIN_SCORE) return toResult(best)
    return null
  }
}

async function loadFoods(prisma) {
  return prisma.food.findMany()
}

// Multi-result variant for the "replace match" picker: top-N scored candidates.
function makeUsdaSearchMany(index, foods, limit = 15) {
  const toResult = (food) => ({
    food_name: food.description,
    food_description: formatDescription(food),
    fdcId: food.fdcId,
  })
  const hasCalories = (food) => food.calories != null && food.calories > 0
  const isZeroCalFood = (name) => /^(salt|water|vinegar|soda water|club soda)/i.test(name)

  return async function searchFoods(name) {
    if (!name || name.trim().length < 2) return []
    const lower = name.toLowerCase().trim()

    const pool = buildPool(index, foods, name)
    const filtered = pool.filter(({ item }) => isZeroCalFood(lower) || hasCalories(item))

    return filtered
      .map(({ item, fuseScore }) => ({
        item,
        score: scoreCandidate(lower, item) - fuseScore * 0.5,
      }))
      .filter(({ score }) => score >= MIN_SCORE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => toResult(item))
  }
}

module.exports = { formatDescription, buildIndex, makeUsdaSearch, makeUsdaSearchMany, loadFoods }
