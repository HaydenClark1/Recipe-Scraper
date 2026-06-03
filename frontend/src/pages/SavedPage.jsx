import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { searchSavedRecipes } from '../api/savedRecipes.js'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import './SavedPage.css'

export function SavedPage() {
  const { list: favorites } = useSavedRecipes()
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) { setResults(null); return }
    const t = setTimeout(() => {
      searchSavedRecipes(term)
        .then(({ recipes }) => setResults(recipes))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const shown = results ?? favorites

  const handleSelect = (recipe) => {
    setRecipe(recipe)
    navigate('/recipe')
  }

  return (
    <div className="saved-page">
      <header className="page-header">
        <h1 className="page-title">Saved Recipes</h1>
      </header>
      <div className="saved-search">
        <input
          type="search"
          className="saved-search__input"
          placeholder="Search saved recipes…"
          aria-label="Search saved recipes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <main className="saved-main">
        {shown.length === 0 ? (
          <div className="saved-empty">
            <svg className="saved-empty__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            <p className="saved-empty__text">{results !== null ? 'No matching recipes.' : 'No saved recipes yet.'}</p>
            {results === null && (
              <p className="saved-empty__hint">Tap the heart on any recipe to save it here.</p>
            )}
          </div>
        ) : (
          <ul className="saved-list">
            {shown.map(recipe => (
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
