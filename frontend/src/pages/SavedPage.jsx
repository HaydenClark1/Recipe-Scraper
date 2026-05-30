import { useNavigate } from 'react-router-dom'
import { useFavorites } from '../hooks/useFavorites.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import './SavedPage.css'

export function SavedPage() {
  const { favorites } = useFavorites()
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()

  const handleSelect = (recipe) => {
    setRecipe(recipe)
    navigate('/recipe')
  }

  return (
    <div className="saved-page">
      <header className="page-header">
        <h1 className="page-title">Saved Recipes</h1>
      </header>
      <main className="saved-main">
        {favorites.length === 0 ? (
          <div className="saved-empty">
            <p className="saved-empty__text">No saved recipes yet.</p>
            <p className="saved-empty__hint">
              Tap ♡ on any recipe to save it here.
            </p>
          </div>
        ) : (
          <ul className="saved-list">
            {favorites.map(recipe => (
              <li key={recipe.id}>
                <SearchResultItem
                  recipe={recipe}
                  onClick={() => handleSelect(recipe)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
