import { useState, useEffect, useCallback } from 'react'
import { listSavedRecipes, createSavedRecipe, deleteSavedRecipe } from '../api/savedRecipes.js'

export function useSavedRecipes() {
  const [list, setList] = useState([])

  const refresh = useCallback(async () => {
    const { recipes } = await listSavedRecipes()
    setList(recipes)
  }, [])

  useEffect(() => { refresh().catch(() => {}) }, [refresh])

  const add = useCallback(async (recipe, overrides) => {
    const { recipe: saved } = await createSavedRecipe(recipe, overrides)
    setList((prev) => [...prev, saved])
    return saved
  }, [])

  const remove = useCallback(async (id) => {
    await deleteSavedRecipe(id)
    setList((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // Saved recipes use DB ids; a freshly scraped recipe has none, so match by
  // sourceUrl when present, otherwise by title.
  const findSaved = useCallback(
    (recipe) =>
      list.find((r) =>
        recipe.sourceUrl && r.sourceUrl ? r.sourceUrl === recipe.sourceUrl : r.title === recipe.title
      ),
    [list]
  )

  const isSaved = useCallback((recipe) => !!findSaved(recipe), [findSaved])

  return { list, add, remove, isSaved, findSaved, refresh }
}
