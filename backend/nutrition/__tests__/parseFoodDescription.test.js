const test = require('node:test')
const assert = require('node:assert')
const { parseFoodDescription } = require('../parseFoodDescription')

test('parses a Per 100g description', () => {
  const r = parseFoodDescription('Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g')
  assert.deepStrictEqual(r.basis, { type: 'mass', grams: 100 })
  assert.strictEqual(r.calories, 52)
  assert.strictEqual(r.fat, 0.17)
  assert.strictEqual(r.carbs, 13.81)
  assert.strictEqual(r.protein, 0.26)
})

test('parses a Per 1 cup description', () => {
  const r = parseFoodDescription('Per 1 cup - Calories: 200kcal | Fat: 8g | Carbs: 25g | Protein: 6g')
  assert.deepStrictEqual(r.basis, { type: 'unit', count: 1, unit: 'cup' })
  assert.strictEqual(r.calories, 200)
})

test('falls back to serving basis when unrecognised', () => {
  const r = parseFoodDescription('Per serving - Calories: 90kcal | Fat: 1g | Carbs: 20g | Protein: 2g')
  assert.deepStrictEqual(r.basis, { type: 'serving' })
})

test('parses a fractional basis quantity like 1/2 cup', () => {
  const r = parseFoodDescription('Per 1/2 cup - Calories: 100kcal | Fat: 0.50g | Carbs: 19.00g | Protein: 3.00g')
  assert.deepStrictEqual(r.basis, { type: 'unit', count: 0.5, unit: 'cup' })
  assert.strictEqual(r.calories, 100)
})

test('parses a mixed-number basis quantity like 1 1/2 cups', () => {
  const r = parseFoodDescription('Per 1 1/2 cups - Calories: 200kcal | Fat: 1g | Carbs: 40g | Protein: 4g')
  assert.deepStrictEqual(r.basis, { type: 'unit', count: 1.5, unit: 'cups' })
})

test('returns null on malformed input', () => {
  assert.strictEqual(parseFoodDescription('not a description'), null)
  assert.strictEqual(parseFoodDescription(''), null)
  assert.strictEqual(parseFoodDescription(null), null)
})
