import { useQuery } from '@tanstack/react-query'
import { getNutrition } from '../api/recipes.js'
import { nutritionKey } from '../lib/nutritionKey.js'

export function useNutrition(recipe, overrides = [], { initialData } = {}) {
  const key = recipe ? nutritionKey(recipe, overrides) : null

  return useQuery({
    queryKey: ['nutrition', key],
    queryFn: () => getNutrition(recipe.ingredients, recipe.servings, overrides),
    enabled: !!key && recipe.ingredients.length > 0,
    initialData,
    staleTime: initialData ? Infinity : 5 * 60 * 1000,
  })
}
