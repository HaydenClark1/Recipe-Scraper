// Units the backend can convert to grams. Mirrors the convertible keys in
// backend/nutrition/units.js (GRAMS). One canonical entry per unit — the value
// is the backend key sent to setAmount; the label is what the user sees.
// Keep in sync with backend GRAMS; units.test.js guards against accidental drift.
export const SUPPORTED_UNITS = [
  { group: 'Mass', value: 'g', label: 'Grams (g)' },
  { group: 'Mass', value: 'kg', label: 'Kilograms (kg)' },
  { group: 'Mass', value: 'oz', label: 'Ounces (oz)' },
  { group: 'Mass', value: 'lb', label: 'Pounds (lb)' },
  { group: 'Volume', value: 'ml', label: 'Milliliters (ml)' },
  { group: 'Volume', value: 'l', label: 'Liters (l)' },
  { group: 'Volume', value: 'tsp', label: 'Teaspoons (tsp)' },
  { group: 'Volume', value: 'tbsp', label: 'Tablespoons (tbsp)' },
  { group: 'Volume', value: 'cup', label: 'Cups' },
  { group: 'Volume', value: 'pint', label: 'Pints' },
  { group: 'Volume', value: 'quart', label: 'Quarts' },
  { group: 'Volume', value: 'gallon', label: 'Gallons' },
  // Count: scales by the matched food's natural serving (e.g. "per 1 large egg").
  { group: 'Count', value: 'each', label: 'Each (count)' },
]
