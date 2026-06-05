const { parseIngredient } = require('./parseIngredient')
const { toGrams } = require('./units')
const { parseFoodDescription } = require('./parseFoodDescription')
const { singularize } = require('./scoreFood')

// "each" amount: a bare count scaled against the matched food's natural serving.
const COUNT_UNIT = 'each'
const CONFIDENCE_STOPWORDS = new Set(['and', 'or', 'of', 'the', 'with', 'for', 'to', 'a', 'an'])
const LOW_CONFIDENCE = 0.85

// Fraction of the ingredient's meaningful words that appear in the matched food's
// name (word-match recall), normalized for plurals. 1 when there are no words to
// compare. Used to flag matches that look unrelated to the recipe ingredient.
function matchConfidence(ingredientName, matchedName) {
  const words = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const queryWords = [...new Set(
    words(cleanForSearch(ingredientName))
      .filter((w) => w.length >= 3 && !CONFIDENCE_STOPWORDS.has(w))
      .map(singularize)
  )]
  if (!queryWords.length) return 1
  const matchWords = new Set(words(matchedName).map(singularize))
  const present = queryWords.filter((w) => matchWords.has(w)).length
  return present / queryWords.length
}

// Strip size/prep modifiers and percentages before sending to food search.
const PREP_STRIP_RE = /\b(extra large|extra virgin|xl|large|medium|small|fresh|freshly|dried|whole|organic|baby|lean|virgin|boneless|skinless|grated|ground|chopped|minced|diced|sliced|crushed|cracked|cold|warm|hot|cooked|raw|unsalted|salted|softened|melted|shredded|bulb|bulbs|leaves|leaf|sprig|sprigs|stalk|stalks|cloves|breast|breasts|thigh|thighs|fillet|fillets)\b/gi
const PCT_STRIP_RE = /\b\d+%\s*/g
const PHRASE_STRIP_RE = /\b(zest of \d+|zest of a|of \d+|to taste)\b/gi
const SPECIAL_CHARS_RE = /[*#@!?]+/g

function cleanForSearch(name) {
  // Strip special chars like ** that appear in recipe ingredient lists
  let s = name.replace(SPECIAL_CHARS_RE, ' ')

  // For compound ingredients split on "and", "or", "and/or", "/" — keep first option only.
  // "Salt and Pepper to taste" → "Salt", "basil and/or mint" → "basil"
  s = s.split(/\s+(?:and\/or|and|or|\/)\s+/i)[0].trim()

  return s
    .replace(PCT_STRIP_RE, '')
    .replace(PHRASE_STRIP_RE, '')
    .replace(PREP_STRIP_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseServings(servings) {
  if (servings == null) return null
  const m = String(servings).match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return n > 0 ? n : null
}

function round(n, dp) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

async function combineNutrition(ingredients, servings, { searchFood, overrides = [] }) {
  const items = []
  const totals = { calories: 0, fat: 0, carbs: 0, protein: 0 }
  let estimated = false

  const lines = ingredients || []

  // index -> { replace?, amount?, exclude? }
  const ovByIndex = new Map()
  for (const o of overrides || []) {
    if (!ovByIndex.has(o.index)) ovByIndex.set(o.index, {})
    ovByIndex.get(o.index)[o.type] = o
  }

  for (let i = 0; i < lines.length; i++) {
    const ov = ovByIndex.get(i) || {}
    let { quantity, unit, name } = parseIngredient(lines[i])
    if (ov.amount) { quantity = ov.amount.quantity; unit = ov.amount.unit }

    if (ov.exclude) {
      items.push({ name, matched: false, excluded: true, overridden: true, needsAmount: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }

    if (ov.manual) {
      const m = ov.manual
      const item = {
        name,
        matched: true,
        excluded: false,
        overridden: true,
        needsAmount: false,
        confidence: null,
        lowConfidence: false,
        matchedName: 'Manual entry',
        matchedBasis: null,
        scaleFactor: null,
        grams: null,
        calories: Math.round(m.calories || 0),
        fat: round(m.fat || 0, 1),
        carbs: round(m.carbs || 0, 1),
        protein: round(m.protein || 0, 1),
      }
      items.push(item)
      totals.calories += item.calories
      totals.fat += item.fat
      totals.carbs += item.carbs
      totals.protein += item.protein
      continue
    }

    let match = null
    if (ov.replace) {
      match = { food_name: ov.replace.foodName, food_description: ov.replace.foodDescription }
    } else {
      try { match = await searchFood(cleanForSearch(name)) } catch { match = null }
    }
    const desc = match && parseFoodDescription(match.food_description)

    if (!desc) {
      estimated = true
      items.push({ name, matched: false, excluded: false, overridden: !!(ov.replace || ov.amount), needsAmount: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }

    const grams = toGrams(quantity, unit)
    let scale
    let approx = false

    if (unit === COUNT_UNIT && quantity != null && (desc.basis.type === 'unit' || desc.basis.type === 'serving')) {
      // "2 each" → count of the matched food's natural serving (e.g. per 1 large egg)
      const basisCount = desc.basis.type === 'unit' ? (desc.basis.count || 1) : 1
      scale = quantity / basisCount
    } else if (grams != null && desc.basis.type === 'mass') {
      // Best case: ingredient weight known, FatSecret gives per-mass data
      scale = grams / desc.basis.grams
    } else if (desc.basis.type === 'unit' && unit && unit === desc.basis.unit && quantity != null) {
      // FatSecret basis unit matches ingredient unit exactly (e.g. both 'cup')
      scale = quantity / desc.basis.count
    } else if (grams != null && desc.basis.type === 'unit') {
      // FatSecret basis unit may have a modifier (e.g. "oz cooked") — extract the weight part
      const basisFirstWord = desc.basis.unit.split(/\s+/)[0]
      const basisGrams = toGrams(desc.basis.count, basisFirstWord)
      if (basisGrams != null) {
        scale = grams / basisGrams
      } else {
        scale = quantity != null ? quantity : 1
        approx = true
      }
    } else if (quantity != null) {
      scale = quantity
      approx = true
    } else {
      scale = 1
      approx = true
    }
    if (approx) estimated = true

    const confidence = round(matchConfidence(name, match.food_name || ''), 2)
    const item = {
      name,
      matched: true,
      excluded: false,
      overridden: !!(ov.replace || ov.amount),
      needsAmount: approx && grams == null,
      confidence,
      // Only flag auto-matches; a user-chosen replace is a deliberate choice.
      lowConfidence: !ov.replace && confidence < LOW_CONFIDENCE,
      matchedName: match.food_name || null,
      matchedBasis: match.food_description || null,
      scaleFactor: round(scale, 4),
      grams: grams != null ? round(grams, 1) : null,
      calories: Math.round((desc.calories || 0) * scale),
      fat: round((desc.fat || 0) * scale, 1),
      carbs: round((desc.carbs || 0) * scale, 1),
      protein: round((desc.protein || 0) * scale, 1),
    }
    items.push(item)
    totals.calories += item.calories
    totals.fat += item.fat
    totals.carbs += item.carbs
    totals.protein += item.protein
  }

  totals.calories = Math.round(totals.calories)
  totals.fat = round(totals.fat, 1)
  totals.carbs = round(totals.carbs, 1)
  totals.protein = round(totals.protein, 1)

  const s = parseServings(servings)
  const perServing = s ? {
    calories: Math.round(totals.calories / s),
    fat: round(totals.fat / s, 1),
    carbs: round(totals.carbs / s, 1),
    protein: round(totals.protein / s, 1),
  } : null

  return { servings: s, totals, perServing, items, estimated }
}

module.exports = { combineNutrition, parseServings, cleanForSearch }
