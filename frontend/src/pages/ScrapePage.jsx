import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { scrapeRecipe } from '../api/recipes.js'
import { normalizeScraped } from '../lib/normalize.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx'
import './ScrapePage.css'

const SLOW_MESSAGE_DELAY = 5000

export function ScrapePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowMessage, setSlowMessage] = useState(false)
  const [error, setError] = useState(null)
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()
  const timerRef = useRef(null)

  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setError(null)
    setLoading(true)
    setSlowMessage(false)
    timerRef.current = setTimeout(() => setSlowMessage(true), SLOW_MESSAGE_DELAY)
    try {
      const data = await scrapeRecipe(url.trim())
      setRecipe(normalizeScraped(data))
      navigate('/recipe')
    } catch (err) {
      if (err.status === 404) {
        setError("Couldn't find a recipe on that page.")
      } else {
        setError(err.message || 'Failed to scrape recipe.')
      }
    } finally {
      clearTimeout(timerRef.current)
      setLoading(false)
      setSlowMessage(false)
    }
  }

  return (
    <div className="scrape-page">
      <header className="page-header">
        <h1 className="page-title">Scrape</h1>
      </header>
      <main className="scrape-main">
        <div className="scrape-hero">
          <p className="scrape-hero__title">Paste a recipe URL</p>
          <p className="scrape-hero__subtitle">Instantly extract ingredients, steps, and nutrition info from any recipe page.</p>
        </div>
        <form className="scrape-form" onSubmit={handleSubmit}>
          <input
            className="scrape-input"
            type="url"
            placeholder="Paste a recipe URL…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
            autoComplete="url"
          />
          <button
            className="scrape-btn"
            type="submit"
            disabled={loading || !url.trim()}
          >
            {loading ? 'Scraping…' : 'Scrape'}
          </button>
        </form>
        {loading && (
          <Spinner message={slowMessage ? 'Waking up the server…' : 'Scraping recipe…'} />
        )}
        {error && !loading && (
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        )}
      </main>
    </div>
  )
}
