const test = require('node:test')
const assert = require('node:assert')
const { pickEnergy, buildFoodRow } = require('../../prisma/importUsda')

test('pickEnergy prefers nutrient 1008, then 2047, then 2048', () => {
  assert.strictEqual(pickEnergy({ 1008: 52, 2047: 60 }), 52)
  assert.strictEqual(pickEnergy({ 2047: 60 }), 60)
  assert.strictEqual(pickEnergy({ 2048: 70 }), 70)
  assert.strictEqual(pickEnergy({}), null)
})

test('buildFoodRow flattens a food + nutrient map into a Prisma row', () => {
  const food = {
    fdc_id: '123',
    data_type: 'sr_legacy_food',
    description: 'Zucchini, raw',
    food_category_id: '11',
  }
  const nutrients = { 1008: 16, 1003: 1.21, 1004: 0.18, 1005: 3.35 }
  assert.deepStrictEqual(buildFoodRow(food, nutrients), {
    fdcId: 123,
    description: 'Zucchini, raw',
    dataType: 'sr_legacy_food',
    category: '11',
    calories: 16,
    protein: 1.21,
    fat: 0.18,
    carbs: 3.35,
  })
})

test('buildFoodRow uses null for missing macros and empty category', () => {
  const food = { fdc_id: '9', data_type: 'foundation_food', description: 'Mystery', food_category_id: '' }
  assert.deepStrictEqual(buildFoodRow(food, {}), {
    fdcId: 9,
    description: 'Mystery',
    dataType: 'foundation_food',
    category: null,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
  })
})
