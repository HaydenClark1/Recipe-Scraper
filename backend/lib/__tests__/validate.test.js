const test = require('node:test')
const assert = require('node:assert')
const { validateUrl, validateIngredients, validateQuery, MAX_INGREDIENTS } = require('../validate')

test('validateUrl accepts a normal http(s) url', () => {
  assert.strictEqual(validateUrl('https://example.com/recipe'), 'https://example.com/recipe')
  assert.strictEqual(validateUrl('  https://x.com  '), 'https://x.com')
})

test('validateUrl rejects non-strings, empties, and over-long input', () => {
  assert.throws(() => validateUrl(undefined), /url/i)
  assert.throws(() => validateUrl(123), /url/i)
  assert.throws(() => validateUrl(''), /url/i)
  assert.throws(() => validateUrl('https://x.com/' + 'a'.repeat(3000)), /too long/i)
})

test('validateIngredients accepts a reasonable array', () => {
  assert.deepStrictEqual(validateIngredients(['2 eggs', 'salt']), ['2 eggs', 'salt'])
})

test('validateIngredients rejects non-arrays', () => {
  assert.throws(() => validateIngredients('eggs'), /array/i)
  assert.throws(() => validateIngredients(null), /array/i)
})

test('validateIngredients rejects too many lines', () => {
  const big = new Array(MAX_INGREDIENTS + 1).fill('x')
  assert.throws(() => validateIngredients(big), /too many/i)
})

test('validateIngredients rejects an over-long single line', () => {
  assert.throws(() => validateIngredients(['a'.repeat(2000)]), /too long/i)
})

test('validateIngredients coerces non-string entries to empty-safe strings', () => {
  // numbers/objects in the array should not crash; they are stringified or rejected
  assert.throws(() => validateIngredients([{}, 'ok']), /invalid/i)
})

test('validateQuery trims and enforces min/max length', () => {
  assert.strictEqual(validateQuery('  egg  '), 'egg')
  assert.throws(() => validateQuery('a'), /too short/i)
  assert.throws(() => validateQuery('a'.repeat(300)), /too long/i)
})
