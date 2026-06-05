const UNIT_WORDS = [
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbl',
  'cup', 'cups', 'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l',
  'clove', 'cloves', 'can', 'cans', 'pinch', 'pinches', 'dash', 'dashes',
  'slice', 'slices', 'stick', 'sticks', 'package', 'packages', 'pkg',
  'handful', 'handfuls', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons',
  'each',
]

export const UNITS = new Set(UNIT_WORDS)

const STOPWORDS = new Set([
  'and', 'or', 'to', 'of', 'the', 'with', 'for', 'a', 'an',
  'taste', 'serving', 'garnish', 'needed', 'divided', 'more', 'plus',
])

const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/

function singularize(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(ches|shes|sses|xes|zes)$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, '')
  return word
}

function pluralize(word) {
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies')
  if (/(ch|sh|s|x|z)$/i.test(word)) return word + 'es'
  return word + 's'
}

export function parseIngredientLine(raw) {
  const original = String(raw == null ? '' : raw).trim()

  let work = original
  while (/\([^()]*\)/.test(work)) work = work.replace(/\([^()]*\)/g, ' ')
  const comma = work.indexOf(',')
  if (comma !== -1) work = work.slice(0, comma)
  work = work.replace(/\s+/g, ' ').trim()

  let amountText = null
  let rest = work
  const qty = work.match(QTY_RE)
  if (qty) {
    const quantity = qty[1].replace(/\s+/g, ' ').trim()
    rest = work.slice(qty[0].length)
    const tokens = rest.split(' ').filter(Boolean)
    let unit = null
    if (tokens.length && UNITS.has(tokens[0].toLowerCase().replace(/\.$/, ''))) {
      unit = tokens.shift().replace(/\.$/, '')
      rest = tokens.join(' ')
    }
    amountText = unit ? `${quantity} ${unit}` : quantity
  }

  const name = rest.trim() || original
  const display = [amountText, name].filter(Boolean).join(' ').trim() || original

  const lowerName = name.toLowerCase()
  const terms = new Set()
  if (lowerName.length >= 3) terms.add(lowerName)
  const words = lowerName.split(' ').filter((w) => w && !STOPWORDS.has(w))
  const head = words[words.length - 1]
  if (head && head.length >= 3) {
    const base = singularize(head)
    terms.add(head)
    terms.add(base)
    terms.add(pluralize(base))
  }
  // When the head noun is itself a unit (e.g. "cloves" in "garlic cloves"),
  // the food name precedes it — promote it so instruction text can match it.
  if (head && UNITS.has(head)) {
    const firstFood = words.find((w) => w !== head && !UNITS.has(w))
    if (firstFood && firstFood.length >= 3) {
      const base = singularize(firstFood)
      terms.add(firstFood)
      terms.add(base)
      terms.add(pluralize(base))
    }
  }
  // Promote all other non-head content words (e.g. "chicken" in "chicken breasts")
  // so they can be matched standalone in instruction text.
  for (const w of words) {
    if (w === head || w.length < 3) continue
    const base = singularize(w)
    terms.add(w)
    terms.add(base)
    terms.add(pluralize(base))
  }
  const matchTerms = [...terms].filter((t) => t.length >= 3)

  return { raw: original, amountText, name, display, matchTerms }
}
