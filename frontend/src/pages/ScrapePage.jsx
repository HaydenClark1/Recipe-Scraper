import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { scrapeRecipe } from '../api/recipes.js'
import { normalizeScraped } from '../lib/normalize.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx'
import './ScrapePage.css'

const SLOW_MESSAGE_DELAY = 5000

export function ScrapePage() {
  const [url, setUrl] = useState('')
  const [slowMessage, setSlowMessage] = useState(false)
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const { mutate, isPending, isError, error, reset } = useMutation({
    mutationFn: (u) => scrapeRecipe(u),
    onMutate: () => {
      setSlowMessage(false)
      timerRef.current = setTimeout(() => setSlowMessage(true), SLOW_MESSAGE_DELAY)
    },
    onSuccess: (data, u) => {
      setRecipe(normalizeScraped(data, u))
      navigate('/recipe')
    },
    onSettled: () => {
      clearTimeout(timerRef.current)
      setSlowMessage(false)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!url.trim()) return
    reset()
    mutate(url.trim())
  }

  const errorMsg = isError
    ? (error?.status === 404 ? "Couldn't find a recipe on that page." : error?.message || 'Failed to scrape recipe.')
    : null

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
            disabled={isPending}
            autoComplete="url"
          />
          <button
            className="scrape-btn"
            type="submit"
            disabled={isPending || !url.trim()}
          >
            {isPending ? 'Scraping…' : 'Scrape'}
          </button>
        </form>
        {isPending && (
          <Spinner message={slowMessage ? 'Waking up the server…' : 'Scraping recipe…'} />
        )}
        {errorMsg && !isPending && (
          <ErrorMessage message={errorMsg} onRetry={reset} />
        )}
      </main>
    </div>
  )
}
