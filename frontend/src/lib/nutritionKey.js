// Stable cache key for a nutrition query — same inputs → same key.
// Mirrors the shape of the backend nutritionSignature without the heavy SHA-256.
export function nutritionKey(recipe, overrides = []) {
  const ingredients = (recipe?.ingredients || []).map((s) => String(s).replace(/\s+/g, ' ').trim())
  const ovSorted = [...(overrides || [])].sort((a, b) => a.index - b.index)
  return JSON.stringify({ ingredients, overrides: ovSorted, servings: recipe?.servings ?? null })
}
