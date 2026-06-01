const test = require('node:test')
const assert = require('node:assert')
const { toGrams } = require('../units')

test('toGrams: weights are exact', () => {
  assert.strictEqual(toGrams(100, 'g'), 100)
  assert.strictEqual(toGrams(1, 'kg'), 1000)
  assert.strictEqual(Math.round(toGrams(1, 'oz')), 28)
  assert.strictEqual(Math.round(toGrams(1, 'lb')), 454)
})

test('toGrams: volumes are approximate (~1 g/ml)', () => {
  assert.strictEqual(Math.round(toGrams(1, 'cup')), 237)
  assert.strictEqual(Math.round(toGrams(1, 'tbsp')), 15)
  assert.strictEqual(Math.round(toGrams(1, 'tsp')), 5)
})

test('toGrams: plural and uppercase units resolve', () => {
  assert.strictEqual(toGrams(2, 'Cups'), toGrams(2, 'cup'))
  assert.strictEqual(toGrams(2, 'grams'), 2)
})

test('toGrams: counts/ambiguous units return null', () => {
  assert.strictEqual(toGrams(2, 'clove'), null)
  assert.strictEqual(toGrams(1, 'can'), null)
})

test('toGrams: missing quantity or unit returns null', () => {
  assert.strictEqual(toGrams(null, 'g'), null)
  assert.strictEqual(toGrams(2, null), null)
  assert.strictEqual(toGrams(2, 'sprinkle'), null)
})
