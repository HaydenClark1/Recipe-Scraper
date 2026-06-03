const test = require('node:test')
const assert = require('node:assert')
const { pickFood, pickFoods } = require('../fatsecretClient')

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

test('pickFoods returns all foods from an array', () => {
  const data = { foods: { food: [{ food_name: 'A' }, { food_name: 'B' }] } }
  assert.deepStrictEqual(pickFoods(data), [{ food_name: 'A' }, { food_name: 'B' }])
})

test('pickFoods wraps a single food object in an array', () => {
  const data = { foods: { food: { food_name: 'Solo' } } }
  assert.deepStrictEqual(pickFoods(data), [{ food_name: 'Solo' }])
})

test('pickFoods returns [] when there are no foods', () => {
  assert.deepStrictEqual(pickFoods({ foods: {} }), [])
  assert.deepStrictEqual(pickFoods({}), [])
  assert.deepStrictEqual(pickFoods(null), [])
})
