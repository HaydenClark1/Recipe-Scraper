import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRecipe } from '../context/RecipeContext.jsx'
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
import { useRecipeEditor } from '../hooks/useRecipeEditor.js'
import { saveRecipe } from '../api/recipes.js'
import { updateRecipe } from '../api/savedRecipes.js'
import { RecipeCarousel } from '../components/RecipeCarousel.jsx'
import { ImageCard } from '../components/cards/ImageCard.jsx'
import { IngredientsCard } from '../components/cards/IngredientsCard.jsx'
import { InstructionsCard } from '../components/cards/InstructionsCard.jsx'
import { NutritionCard } from '../components/cards/NutritionCard.jsx'
import { IngredientsEditor } from '../components/IngredientsEditor.jsx'
import { InstructionsEditor } from '../components/InstructionsEditor.jsx'
import './RecipeDetailPage.css'

export function RecipeDetailPage() {
  const { recipe } = useRecipe()
  const navigate = useNavigate()
  const { add, remove, findSaved } = useSavedRecipes()
  const [saveDbState, setSaveDbState] = useState('idle')
  const [editing, setEditing] = useState(null) // 'ingredients' | 'instructions' | null

  // All hooks must run before any early return (rules of hooks).
  const savedRow = recipe ? findSaved(recipe) : null

  // Seed the working document from the saved row (rich) if present, else the scraped recipe.
  const editor = useRecipeEditor(savedRow || recipe || {})

  // Debounced autosave for already-saved recipes. Skips the initial render.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!savedRow) return
    const t = setTimeout(() => {
      updateRecipe(savedRow.id, editor.toPayload()).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRow, editor.ingredients, editor.instructions])

  if (!recipe) {
    return <Navigate to="/scrape" replace />
  }

  const fav = !!savedRow
  const derivedRecipe = { ...recipe, ingredients: editor.ingredientTexts, instructions: editor.instructionTexts }

  const handleToggleFav = () => {
    if (savedRow) {
      remove(savedRow.id)
    } else {
      add(editor.toPayload())
    }
  }

  const handleSaveToDb = async () => {
    if (saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate') return
    setSaveDbState('loading')
    try {
      await saveRecipe(derivedRecipe)
      setSaveDbState('saved')
    } catch (err) {
      if (err.status === 400) setSaveDbState('duplicate')
      else { setSaveDbState('error'); setTimeout(() => setSaveDbState('idle'), 3000) }
    }
  }

  return (
    <div className="recipe-detail-page">
      <header className="detail-header">
        <button className="detail-back" onClick={() => navigate(-1)} aria-label="Go back">
          <svg className="detail-back__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
      </header>
      <RecipeCarousel
        slides={[
          <ImageCard recipe={derivedRecipe} isFav={fav} onToggleFav={handleToggleFav} saveDbState={saveDbState} onSaveToDb={handleSaveToDb} />,
          <IngredientsCard recipe={derivedRecipe} onEdit={() => setEditing('ingredients')} />,
          <InstructionsCard recipe={derivedRecipe} onEdit={() => setEditing('instructions')} />,
          <NutritionCard recipe={derivedRecipe} overrides={editor.overrides} onEdit={() => setEditing('ingredients')} />,
        ]}
      />
      {editing === 'ingredients' && (
        <IngredientsEditor editor={editor} items={editor.ingredients} onClose={() => setEditing(null)} />
      )}
      {editing === 'instructions' && (
        <InstructionsEditor editor={editor} items={editor.instructions} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
