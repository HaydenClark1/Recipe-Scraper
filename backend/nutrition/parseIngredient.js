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
]
const UNITS = new Set(UNIT_WORDS)
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/

// Matches "(80 grams)", "(20g)", "(1.5 oz)", etc. — authoritative weight hint from recipe author
const PAREN_WEIGHT_RE = /\(\s*(\d+(?:\.\d+)?)\s*(g(?:rams?)?|oz|ounces?|lbs?|pounds?|kg)\s*\)/i

function evalQuantity(text) {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = text.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const range = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function parseIngredient(raw) {
  const original = String(raw == null ? '' : raw).trim()

  // Capture explicit gram/weight hint before stripping parens (e.g. "(80 grams)")
  let parenWeight = null
  const parenMatch = original.match(PAREN_WEIGHT_RE)
  if (parenMatch) {
    parenWeight = { quantity: Number(parenMatch[1]), unit: parenMatch[2].toLowerCase() }
  }

  let work = original
  while (/\([^()]*\)/.test(work)) work = work.replace(/\([^()]*\)/g, ' ')
  const comma = work.indexOf(',')
  if (comma !== -1) work = work.slice(0, comma)
  work = work.replace(/\s+/g, ' ').trim()

  let quantity = null
  let unit = null
  let rest = work
  const qty = work.match(QTY_RE)
  if (qty) {
    quantity = evalQuantity(qty[1].replace(/\s+/g, ' ').trim())
    rest = work.slice(qty[0].length)
    const tokens = rest.split(' ').filter(Boolean)
    if (tokens.length && UNITS.has(tokens[0].toLowerCase().replace(/\.$/, ''))) {
      unit = tokens.shift().toLowerCase().replace(/\.$/, '')
      rest = tokens.join(' ')
    }
  }
  const name = rest.trim() || original

  // Use paren gram weight only when no measurable unit was parsed (e.g. "2 Jalapeno (40 grams)").
  // When a volume/weight unit was already found (e.g. "1/2 cup Panko (20 grams)"), keep the
  // original unit so the volume-based FatSecret basis can match directly.
  if (parenWeight && unit === null) {
    return { quantity: parenWeight.quantity, unit: parenWeight.unit, name }
  }
  return { quantity, unit, name }
}

module.exports = { parseIngredient }
