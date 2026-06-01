const test = require('node:test')
const assert = require('node:assert')
const { formatDescription, buildIndex, makeUsdaSearch } = require('../usdaClient')

const FOODS = [
  { fdcId: 1, description: 'Zucchini, raw', calories: 16, fat: 0.18, carbs: 3.35, protein: 1.21 },
  { fdcId: 2, description: 'Wheat flour, white, all-purpose', calories: 364, fat: 0.98, carbs: 76.31, protein: 10.33 },
]

test('formatDescription builds a Per 100g macro string', () => {
  assert.strictEqual(
    formatDescription(FOODS[0]),
    'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g'
  )
})

test('formatDescription treats null macros as 0', () => {
  assert.strictEqual(
    formatDescription({ description: 'X', calories: null, fat: null, carbs: null, protein: null }),
    'Per 100g - Calories: 0kcal | Fat: 0g | Carbs: 0g | Protein: 0g'
  )
})

test('makeUsdaSearch returns the top fuzzy match in the provider contract', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS))
  const r = await search('zucchini')
  assert.strictEqual(r.food_name, 'Zucchini, raw')
  assert.strictEqual(r.food_description, 'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g')
})

test('makeUsdaSearch returns null when nothing matches', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS))
  assert.strictEqual(await search('zzzzzzzz'), null)
})
