const test = require('node:test')
const assert = require('node:assert')
const { pickFood } = require('../fatsecretClient')

test('pickFood returns the first food from an array', () => {
  const data = { foods: { food: [{ food_name: 'A' }, { food_name: 'B' }] } }
  assert.deepStrictEqual(pickFood(data), { food_name: 'A' })
})

test('pickFood returns a single food object as-is', () => {
  const data = { foods: { food: { food_name: 'Solo' } } }
  assert.deepStrictEqual(pickFood(data), { food_name: 'Solo' })
})

test('pickFood returns null when there are no foods', () => {
  assert.strictEqual(pickFood({ foods: {} }), null)
  assert.strictEqual(pickFood({ foods: { food: [] } }), null)
  assert.strictEqual(pickFood({}), null)
  assert.strictEqual(pickFood(null), null)
})
