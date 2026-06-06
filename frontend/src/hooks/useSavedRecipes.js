import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listSavedRecipes, createSavedRecipe, deleteSavedRecipe } from '../api/savedRecipes.js'

export const SAVED_RECIPES_KEY = ['saved-recipes']

export function useSavedRecipes() {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: SAVED_RECIPES_KEY,
    queryFn: () => listSavedRecipes().then((r) => r.recipes),
    staleTime: 2 * 60 * 1000,
  })
  const list = data ?? []

  const addMutation = useMutation({
    mutationFn: (recipe) => createSavedRecipe(recipe).then((r) => r.recipe),
    onSuccess: (saved) => {
      qc.setQueryData(SAVED_RECIPES_KEY, (prev = []) => [...prev, saved])
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id) => deleteSavedRecipe(id),
    onSuccess: (_, id) => {
      qc.setQueryData(SAVED_RECIPES_KEY, (prev = []) => prev.filter((r) => r.id !== id))
    },
  })

  const add = useCallback((recipe) => addMutation.mutateAsync(recipe), [addMutation])
  const remove = useCallback((id) => removeMutation.mutateAsync(id), [removeMutation])
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: SAVED_RECIPES_KEY }), [qc])

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
