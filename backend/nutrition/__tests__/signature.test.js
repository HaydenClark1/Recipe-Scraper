const test = require('node:test')
const assert = require('node:assert')
const { nutritionSignature } = require('../signature')

const base = {
  ingredients: ['2 eggs', '1 cup flour'],
  overrides: [{ index: 0, type: 'exclude' }],
  servings: '4',
}

test('same inputs produce the same hash', () => {
  assert.strictEqual(nutritionSignature(base), nutritionSignature(base))
})

test('hash is stable regardless of override object key order', () => {
  const a = nutritionSignature(base)
  const b = nutritionSignature({
    ...base,
    overrides: [{ type: 'exclude', index: 0 }],
  })
  assert.strictEqual(a, b)
})

test('hash changes when an ingredient changes', () => {
  const changed = { ...base, ingredients: ['3 eggs', '1 cup flour'] }
  assert.notStrictEqual(nutritionSignature(base), nutritionSignature(changed))
})

test('hash changes when overrides change', () => {
  const changed = { ...base, overrides: [] }
  assert.notStrictEqual(nutritionSignature(base), nutritionSignature(changed))
})

test('hash changes when servings change', () => {
  const changed = { ...base, servings: '2' }
  assert.notStrictEqual(nutritionSignature(base), nutritionSignature(changed))
})

test('hash is insensitive to extra whitespace in ingredient text', () => {
  const a = nutritionSignature(base)
  const b = nutritionSignature({ ...base, ingredients: ['2  eggs', '1 cup flour'] })
  assert.strictEqual(a, b)
})

test('null/undefined overrides treated the same as empty array', () => {
  const a = nutritionSignature({ ...base, overrides: [] })
  const b = nutritionSignature({ ...base, overrides: null })
  assert.strictEqual(a, b)
})
