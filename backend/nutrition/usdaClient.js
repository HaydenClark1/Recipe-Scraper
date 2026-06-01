const Fuse = require('fuse.js')

// USDA macros are stored per 100g; emit the same string shape FatSecret returns
// so parseFoodDescription can read it unchanged.
function formatDescription(food) {
  const n = (v) => (v == null ? 0 : v)
  return `Per 100g - Calories: ${n(food.calories)}kcal | Fat: ${n(food.fat)}g | Carbs: ${n(food.carbs)}g | Protein: ${n(food.protein)}g`
}

function buildIndex(foods) {
  return new Fuse(foods, {
    keys: ['description'],
    threshold: 0.3,
    ignoreLocation: true,
  })
}

function makeUsdaSearch(index) {
  return async function searchFood(name) {
    const hits = index.search(name)
    if (!hits.length) return null
    const food = hits[0].item
    return { food_name: food.description, food_description: formatDescription(food) }
  }
}

async function loadFoods(prisma) {
  return prisma.food.findMany()
}

module.exports = { formatDescription, buildIndex, makeUsdaSearch, loadFoods }
