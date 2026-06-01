// Grams per unit. Volumes assume ~1 g/ml (water-like) — intentionally approximate.
const GRAMS = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: 4.92892, tsps: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  tbsp: 14.7868, tbsps: 14.7868, tbl: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  cup: 236.588, cups: 236.588,
  pint: 473.176, pints: 473.176,
  quart: 946.353, quarts: 946.353,
  gallon: 3785.41, gallons: 3785.41,
}

function toGrams(quantity, unit) {
  if (quantity == null || !Number.isFinite(quantity)) return null
  if (!unit) return null
  const key = String(unit).toLowerCase().replace(/\.$/, '')
  const g = GRAMS[key]
  return g == null ? null : quantity * g
}

module.exports = { toGrams, GRAMS }
