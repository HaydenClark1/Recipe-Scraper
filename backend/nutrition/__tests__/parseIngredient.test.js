const test = require('node:test')
const assert = require('node:assert')
const { parseIngredient } = require('../parseIngredient')

test('splits quantity, unit, and name', () => {
  assert.deepStrictEqual(parseIngredient('2 cups flour'),
    { quantity: 2, unit: 'cups', name: 'flour' })
})

test('evaluates a simple fraction', () => {
  const r = parseIngredient('1/2 tsp Italian seasoning')
  assert.strictEqual(r.quantity, 0.5)
  assert.strictEqual(r.unit, 'tsp')
  assert.strictEqual(r.name, 'Italian seasoning')
})

test('evaluates a mixed number', () => {
  assert.strictEqual(parseIngredient('1 1/2 cups sugar').quantity, 1.5)
})

test('averages a range', () => {
  assert.strictEqual(parseIngredient('2-3 cloves garlic').quantity, 2.5)
})

test('handles a count with no unit', () => {
  assert.deepStrictEqual(parseIngredient('3 eggs'),
    { quantity: 3, unit: null, name: 'eggs' })
})

test('drops parentheticals and post-comma prep notes', () => {
  const r = parseIngredient('1 cup flour (sifted), packed')
  assert.strictEqual(r.name, 'flour')
})

test('handles an amount-less line', () => {
  assert.deepStrictEqual(parseIngredient('Salt and pepper to taste'),
    { quantity: null, unit: null, name: 'Salt and pepper to taste' })
})

test('uses gram weight from parenthetical when present', () => {
  const r = parseIngredient('2 Jalapeno (diced, (40 grams))')
  assert.strictEqual(r.quantity, 40)
  assert.strictEqual(r.unit, 'grams')
  assert.strictEqual(r.name, 'Jalapeno')
})

test('paren gram weight is ignored when a volume unit was already parsed', () => {
  // 1/2 cup is the right thing to scale against FatSecret's per-cup basis.
  const r = parseIngredient('1/2 cup Panko Bread Crumbs ((20 grams))')
  assert.strictEqual(r.quantity, 0.5)
  assert.strictEqual(r.unit, 'cup')
  assert.strictEqual(r.name, 'Panko Bread Crumbs')
})

test('non-weight parentheticals like (sifted) are stripped and ignored', () => {
  const r = parseIngredient('1 cup flour (sifted), packed')
  assert.strictEqual(r.quantity, 1)
  assert.strictEqual(r.unit, 'cup')
  assert.strictEqual(r.name, 'flour')
})

test('comma followed by prep word strips correctly', () => {
  assert.strictEqual(parseIngredient('2 carrots, diced').name, 'carrots')
  assert.strictEqual(parseIngredient('1 cup flour, sifted').name, 'flour')
})

test('comma followed by adjective (not prep word) keeps full name', () => {
  const r = parseIngredient('4 boneless, skinless chicken thighs')
  assert.strictEqual(r.name, 'boneless, skinless chicken thighs')
})
