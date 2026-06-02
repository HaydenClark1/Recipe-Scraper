const { parseIngredient } = require('./parseIngredient')
const { toGrams } = require('./units')
const { parseFoodDescription } = require('./parseFoodDescription')

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
      items.push({ name, matched: false, excluded: true, overridden: true, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
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
      items.push({ name, matched: false, excluded: false, overridden: !!(ov.replace || ov.amount), grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }

    const grams = toGrams(quantity, unit)
    let scale
    let approx = false

    if (grams != null && desc.basis.type === 'mass') {
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

    const item = {
      name,
      matched: true,
      excluded: false,
      overridden: !!(ov.replace || ov.amount),
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
