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
  const search = makeUsdaSearch(buildIndex(FOODS), FOODS)
  const r = await search('zucchini')
  assert.strictEqual(r.food_name, 'Zucchini, raw')
  assert.strictEqual(r.food_description, 'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g')
})

test('prefix-match finds "Salt, table" not "Butter, salted" for "salt"', async () => {
  const foods = [
    { fdcId: 10, description: 'Butter, salted', calories: 717, fat: 81.11, carbs: 0.06, protein: 0.85 },
    { fdcId: 11, description: 'Salt, table', calories: 0, fat: 0, carbs: 0, protein: 0 },
  ]
  const search = makeUsdaSearch(buildIndex(foods), foods)
  const r = await search('salt')
  assert.strictEqual(r.food_name, 'Salt, table')
})

test('prefix-match prefers shorter primary — "Butter, with salt" over "Butter replacement"', async () => {
  const foods = [
    { fdcId: 20, description: 'Butter replacement, without fat', calories: 373, fat: 1, carbs: 89, protein: 2 },
    { fdcId: 21, description: 'Butter, with salt', calories: 717, fat: 81, carbs: 0.06, protein: 0.85 },
  ]
  const search = makeUsdaSearch(buildIndex(foods), foods)
  const r = await search('butter')
  assert.strictEqual(r.food_name, 'Butter, with salt')
})

test('word-set match finds "Oil, olive" for "olive oil" (word-order inversion)', async () => {
  const foods = [
    { fdcId: 30, description: 'Mayonnaise, reduced fat, with olive oil', calories: 361, fat: 40, carbs: 0, protein: 0.37 },
    { fdcId: 31, description: 'Oil, olive, salad or cooking', calories: 884, fat: 100, carbs: 0, protein: 0 },
  ]
  const search = makeUsdaSearch(buildIndex(foods), foods)
  const r = await search('olive oil')
  assert.strictEqual(r.food_name, 'Oil, olive, salad or cooking')
})

test('skips 0-calorie Fuse hits and returns next match with calories', async () => {
  const foods = [
    { fdcId: 40, description: 'Lunchmeat, chicken breast, sliced', calories: 0, fat: 0, carbs: 0, protein: 0 },
    { fdcId: 41, description: 'Chicken, broilers, breast, raw', calories: 165, fat: 3.6, carbs: 0, protein: 31 },
  ]
  const search = makeUsdaSearch(buildIndex(foods), foods)
  const r = await search('chicken breast')
  assert.strictEqual(r.food_name, 'Chicken, broilers, breast, raw')
})

test('makeUsdaSearch returns null when nothing matches', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS), FOODS)
  assert.strictEqual(await search('zzzzzzzz'), null)
})

test('makeUsdaSearch returns null for empty or too-short name', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS), FOODS)
  assert.strictEqual(await search(''), null)
  assert.strictEqual(await search('a'), null)
})
