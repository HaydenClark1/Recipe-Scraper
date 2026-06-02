// Compose providers into one searchFood(name): try USDA, fall back to FatSecret.
function makeFoodResolver({ usdaSearch, fatsecretSearch }) {
  return async function searchFood(name) {
    try {
      const usda = await usdaSearch(name)
      if (usda) return usda
    } catch {
      // fall through to fallback
    }
    if (!fatsecretSearch) return null
    try {
      return await fatsecretSearch(name)
    } catch {
      return null
    }
  }
}

// Multi-result composition for /search-foods.
function makeFoodsResolver({ usdaSearchMany, fatsecretSearchMany }) {
  return async function searchFoods(name) {
    if (usdaSearchMany) {
      try {
        const usda = await usdaSearchMany(name)
        if (usda && usda.length) return usda
      } catch {
        // fall through
      }
    }
    if (!fatsecretSearchMany) return []
    try {
      return await fatsecretSearchMany(name)
    } catch {
      return []
    }
  }
}

module.exports = { makeFoodResolver, makeFoodsResolver }
