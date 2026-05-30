import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRecipe } from '../context/RecipeContext.jsx'
import { useFavorites } from '../hooks/useFavorites.js'
import { saveRecipe } from '../api/recipes.js'
import { RecipeCarousel } from '../components/RecipeCarousel.jsx'
import { ImageCard } from '../components/cards/ImageCard.jsx'
import { IngredientsCard } from '../components/cards/IngredientsCard.jsx'
import { InstructionsCard } from '../components/cards/InstructionsCard.jsx'
import { NutritionCard } from '../components/cards/NutritionCard.jsx'
import './RecipeDetailPage.css'

export function RecipeDetailPage() {
  const { recipe } = useRecipe()
  const navigate = useNavigate()
  const { isFavorite, addFavorite, removeFavorite } = useFavorites()
  const [saveDbState, setSaveDbState] = useState('idle')

  if (!recipe) {
    return <Navigate to="/scrape" replace />
  }

  const fav = isFavorite(recipe.id)

  const handleToggleFav = () => {
    fav ? removeFavorite(recipe.id) : addFavorite(recipe)
  }

  const handleSaveToDb = async () => {
    if (saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate') return
    setSaveDbState('loading')
    try {
      await saveRecipe(recipe)
      setSaveDbState('saved')
    } catch (err) {
      if (err.status === 400) {
        setSaveDbState('duplicate')
      } else {
        setSaveDbState('error')
        setTimeout(() => setSaveDbState('idle'), 3000)
      }
    }
  }

  return (
    <div className="recipe-detail-page">
      <header className="detail-header">
        <button
          className="detail-back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ‹ Back
        </button>
      </header>
      <RecipeCarousel
        slides={[
          <ImageCard
            recipe={recipe}
            isFav={fav}
            onToggleFav={handleToggleFav}
            saveDbState={saveDbState}
            onSaveToDb={handleSaveToDb}
          />,
          <IngredientsCard recipe={recipe} />,
          <InstructionsCard recipe={recipe} />,
          <NutritionCard recipe={recipe} />,
        ]}
      />
    </div>
  )
}
