import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchRecipes } from '../api/recipes.js'
import { normalizeSearchResult } from '../lib/normalize.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx'
import './SearchPage.css'

export function SearchPage() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!term.trim()) return
    setError(null)
    setLoading(true)
    setSearched(true)
    try {
      const data = await searchRecipes(term.trim())
      setResults(data.recipes || [])
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (rawItem) => {
    setRecipe(normalizeSearchResult(rawItem))
    navigate('/recipe')
  }

  return (
    <div className="search-page">
      <header className="page-header">
        <h1 className="page-title">Search Recipes</h1>
      </header>
      <main className="search-main">
        <form className="search-form" onSubmit={handleSearch}>
          <input
            className="search-input"
            type="search"
            placeholder="Search 13,000+ recipes…"
            value={term}
            onChange={e => setTerm(e.target.value)}
          />
          <button
            className="search-btn"
            type="submit"
            disabled={loading || !term.trim()}
          >
            Search
          </button>
        </form>
        {loading && <Spinner message="Searching…" />}
        {error && !loading && (
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        )}
        {!loading && searched && results.length === 0 && !error && (
          <p className="search-empty">No results found.</p>
        )}
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((item, i) => (
              <li key={i}>
                <SearchResultItem
                  recipe={{ title: item.Title, image: item.Image_Name || null }}
                  onClick={() => handleSelect(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
