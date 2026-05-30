import { useState, useEffect, useCallback } from 'react'
import { Preferences } from '@capacitor/preferences'

const KEY = 'recipe-favorites'

async function loadFavorites() {
  const { value } = await Preferences.get({ key: KEY })
  return value ? JSON.parse(value) : []
}

async function persistFavorites(list) {
  await Preferences.set({ key: KEY, value: JSON.stringify(list) })
}

export function useFavorites() {
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    loadFavorites().then(setFavorites)
  }, [])

  const addFavorite = useCallback(async (recipe) => {
    const updated = [
      ...favorites.filter(f => f.id !== recipe.id),
      { ...recipe, source: 'favorite' },
    ]
    setFavorites(updated)
    await persistFavorites(updated)
  }, [favorites])

  const removeFavorite = useCallback(async (id) => {
    const updated = favorites.filter(f => f.id !== id)
    setFavorites(updated)
    await persistFavorites(updated)
  }, [favorites])

  const isFavorite = useCallback((id) =>
    favorites.some(f => f.id === id), [favorites])

  return { favorites, addFavorite, removeFavorite, isFavorite }
}
