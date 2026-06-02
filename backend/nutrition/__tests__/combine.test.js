const test = require('node:test')
const assert = require('node:assert')
const { combineNutrition, parseServings, cleanForSearch } = require('../combine')

// Fake searchFood keyed by the parsed ingredient name.
const fake = (map) => async (name) => map[name] || null

test('parseServings extracts a positive number or null', () => {
  assert.strictEqual(parseServings('4'), 4)
  assert.strictEqual(parseServings('8 servings'), 8)
  assert.strictEqual(parseServings(null), null)
  assert.strictEqual(parseServings('0'), null)
  assert.strictEqual(parseServings('N/A'), null)
})

test('scales a mass basis by grams', async () => {
  const searchFood = fake({
    sugar: { food_name: 'Sugar', food_description: 'Per 100g - Calories: 400kcal | Fat: 0g | Carbs: 100g | Protein: 0g' },
  })
  const r = await combineNutrition(['200 g sugar'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 800)
  assert.strictEqual(r.totals.carbs, 200)
  assert.strictEqual(r.items[0].matched, true)
  assert.strictEqual(r.perServing, null)
})

test('computes per-serving when servings is known', async () => {
  const searchFood = fake({
    rice: { food_name: 'Rice', food_description: 'Per 100g - Calories: 100kcal | Fat: 0g | Carbs: 20g | Protein: 2g' },
  })
  const r = await combineNutrition(['400 g rice'], '4', { searchFood })
  assert.strictEqual(r.totals.calories, 400)
  assert.strictEqual(r.servings, 4)
  assert.strictEqual(r.perServing.calories, 100)
})

test('unmatched ingredient contributes zero and is flagged', async () => {
  const r = await combineNutrition(['1 pinch unobtainium'], null, { searchFood: fake({}) })
  assert.strictEqual(r.items[0].matched, false)
  assert.strictEqual(r.totals.calories, 0)
  assert.strictEqual(r.estimated, true)
})

test('cleanForSearch strips size/prep modifiers and percentages', () => {
  assert.strictEqual(cleanForSearch('Large Whole Eggs'), 'Eggs')
  assert.strictEqual(cleanForSearch('95% Lean Ground Chicken'), 'Chicken')
  assert.strictEqual(cleanForSearch('Fresh Basil Leaves'), 'Basil')
  assert.strictEqual(cleanForSearch('Extra Virgin Olive Oil'), 'Olive Oil')
  assert.strictEqual(cleanForSearch('sugar'), 'sugar')
})

test('cleanForSearch keeps only the first option from compound ingredients', () => {
  assert.strictEqual(cleanForSearch('basil and/or mint leaves'), 'basil')
  assert.strictEqual(cleanForSearch('spaghetti or bucatini pasta'), 'spaghetti')
  assert.strictEqual(cleanForSearch('pecorino or Parmesan cheese'), 'pecorino')
  assert.strictEqual(cleanForSearch('Salt and Pepper to taste'), 'Salt')
})

test('cleanForSearch strips prep phrases, special chars, and "to taste"', () => {
  assert.strictEqual(cleanForSearch('Freshly ground black pepper'), 'black pepper')
  assert.strictEqual(cleanForSearch('Zest of 1 lemon'), 'lemon')
  assert.strictEqual(cleanForSearch('freshly cracked black pepper'), 'black pepper')
  assert.strictEqual(cleanForSearch('whole garlic bulb **'), 'garlic')
  assert.strictEqual(cleanForSearch('Salt and Pepper to taste'), 'Salt')
})

test('scales a unit basis whose unit has a weight modifier (e.g. oz cooked)', async () => {
  // FatSecret returns "Per 3 oz cooked" — basis.unit = 'oz cooked', basis.count = 3
  // Ingredient is "16 oz chicken" → grams = 453.6
  // Expected scale = 453.6 / toGrams(3, 'oz') = 453.6 / 85.05 ≈ 5.33 → 120 × 5.33 ≈ 640 cal
  const searchFood = async () => ({
    food_name: 'Ground Chicken',
    food_description: 'Per 3 oz cooked - Calories: 120kcal | Fat: 1.50g | Carbs: 0.00g | Protein: 23.00g',
  })
  const r = await combineNutrition(['16 oz chicken'], null, { searchFood })
  assert.ok(r.totals.calories > 600 && r.totals.calories < 700,
    `Expected ~640 cal, got ${r.totals.calories}`)
  assert.strictEqual(r.estimated, false)
})

test('paren gram weight on a count ingredient flows through to correct scaling', async () => {
  // "2 Jalapeno (40 grams)": no unit → paren overrides, grams=40, scale=40/100=0.4 → 12 cal
  const searchFood = async (name) => name === 'Jalapeno' ? {
    food_name: 'Jalapeno Peppers',
    food_description: 'Per 100g - Calories: 30kcal | Fat: 0.62g | Carbs: 5.91g | Protein: 1.35g',
  } : null
  const r = await combineNutrition(['2 Jalapeno (diced, (40 grams))'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 12)
})

test('paren gram weight is ignored when a volume unit is present, scaling by volume instead', async () => {
  // "1/2 cup Panko (20 grams)": unit='cup' → paren ignored, scale = 0.5/0.5 = 1 → 100 cal
  const searchFood = async () => ({
    food_name: 'Panko Bread Crumbs',
    food_description: 'Per 1/2 cup - Calories: 100kcal | Fat: 0.50g | Carbs: 19.00g | Protein: 3.00g',
  })
  const r = await combineNutrition(['1/2 cup Panko Bread Crumbs ((20 grams))'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 100)
})

test('sums multiple ingredients', async () => {
  const searchFood = fake({
    flour: { food_name: 'Flour', food_description: 'Per 100g - Calories: 100kcal | Fat: 1g | Carbs: 20g | Protein: 3g' },
    butter: { food_name: 'Butter', food_description: 'Per 100g - Calories: 700kcal | Fat: 80g | Carbs: 0g | Protein: 1g' },
  })
  const r = await combineNutrition(['100 g flour', '100 g butter'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 800)
  assert.strictEqual(r.totals.fat, 81)
})

test('exclude override zeroes a line and flags it', async () => {
  const searchFood = async () => ({ food_name: 'X', food_description: 'Per 100g - Calories: 100kcal | Fat: 1g | Carbs: 1g | Protein: 1g' })
  const overrides = [{ index: 0, type: 'exclude' }]
  const { items, totals } = await combineNutrition(['1 g salt'], null, { searchFood, overrides })
  assert.strictEqual(items[0].excluded, true)
  assert.strictEqual(items[0].calories, 0)
  assert.strictEqual(totals.calories, 0)
})

test('replace override uses the given food instead of searching', async () => {
  let searched = false
  const searchFood = async () => { searched = true; return null }
  const overrides = [{ index: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'Per 100g - Calories: 200kcal | Fat: 5g | Carbs: 0g | Protein: 30g' }]
  const { items } = await combineNutrition(['100 g chicken'], null, { searchFood, overrides })
  assert.strictEqual(searched, false)
  assert.strictEqual(items[0].overridden, true)
  assert.strictEqual(items[0].matchedName, 'Chicken')
  assert.strictEqual(items[0].calories, 200)
})

test('amount override changes the scaling quantity', async () => {
  const searchFood = async () => ({ food_name: 'Garlic', food_description: 'Per 100g - Calories: 100kcal | Fat: 0g | Carbs: 20g | Protein: 5g' })
  const overrides = [{ index: 0, type: 'amount', quantity: 200, unit: 'g' }]
  const { items } = await combineNutrition(['1 g garlic'], null, { searchFood, overrides })
  assert.strictEqual(items[0].calories, 200) // 200g of a per-100g food
})

test('out-of-range override index is ignored', async () => {
  const searchFood = async () => null
  const overrides = [{ index: 5, type: 'exclude' }]
  const { items } = await combineNutrition(['1 g salt'], null, { searchFood, overrides })
  assert.strictEqual(items.length, 1)
})
