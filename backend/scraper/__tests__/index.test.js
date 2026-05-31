const test = require('node:test')
const assert = require('node:assert')
const { assembleRecipe } = require('../index')

const BUDGET_BYTES = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Recipe","name":"Creamy Garlic Chicken Recipe","image":["https://x/bb.jpg"],"prepTime":"PT10M","cookTime":"PT30M","totalTime":"PT40M","recipeYield":["4"],"recipeCuisine":["American"],"recipeCategory":["Dinner"],"recipeIngredient":["2  boneless, skinless chicken breasts ($6.49)","1/2 tsp Italian seasoning ($0.05)"],"recipeInstructions":[{"@type":"HowToStep","text":"Using a sharp knife, fillet each chicken breast into two cutlets."},{"@type":"HowToStep","text":"Season &amp; sear until golden."}]}
</script></head><body></body></html>`

const HALF_BAKED = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Recipe","name":"30 Minute Honey Garlic Chicken","image":{"url":"https://x/hbh.jpg"},"prepTime":"PT10M","totalTime":"PT30M","recipeYield":["4"],"recipeIngredient":["2 pounds chicken breasts, cubed"],"recipeInstructions":[{"@type":"HowToStep","text":"1. Preheat the oven to 450 F. Line a baking sheet with oil.2. On the sheet pan, mix the chicken.3. Meanwhile, make the sauce.4. Remove the vegetables."}]}
</script></head><body></body></html>`

test('assembleRecipe: BudgetBytes yields clean servings, times, and steps', () => {
  const r = assembleRecipe(BUDGET_BYTES)
  assert.strictEqual(r.title, 'Creamy Garlic Chicken Recipe')
  assert.strictEqual(r.servings, '4')
  assert.strictEqual(r.prepTime, '10 min')
  assert.strictEqual(r.totalTime, '40 min')
  assert.deepStrictEqual(r.cuisine, ['American'])
  assert.deepStrictEqual(r.category, ['Dinner'])
  assert.strictEqual(r.image, 'https://x/bb.jpg')
  assert.deepStrictEqual(r.instructions, [
    'Using a sharp knife, fillet each chicken breast into two cutlets.',
    'Season & sear until golden.',
  ])
})

test('assembleRecipe: HalfBakedHarvest crammed steps split with no leading numbers', () => {
  const r = assembleRecipe(HALF_BAKED)
  assert.strictEqual(r.servings, '4')
  assert.strictEqual(r.totalTime, '30 min')
  assert.strictEqual(r.image, 'https://x/hbh.jpg')
  assert.deepStrictEqual(r.instructions, [
    'Preheat the oven to 450 F. Line a baking sheet with oil.',
    'On the sheet pan, mix the chicken.',
    'Meanwhile, make the sauce.',
    'Remove the vegetables.',
  ])
})

test('assembleRecipe returns null when no recipe found', () => {
  assert.strictEqual(assembleRecipe('<html><body><p>nope</p></body></html>'), null)
})
