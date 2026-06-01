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

module.exports = { makeFoodResolver }
