import { useState, useEffect } from 'react'
import { getNutrition } from '../../api/recipes.js'
import { Spinner } from '../ui/Spinner.jsx'
import './NutritionCard.css'

export function NutritionCard({ recipe }) {
  const [nutrition, setNutrition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!recipe.ingredients.length) {
      setLoading(false)
      return
    }
    getNutrition(recipe.ingredients)
      .then(data => {
        setNutrition(data.nutrition || [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [recipe.ingredients])

  return (
    <div className="nutrition-card">
      <h2 className="card-heading">Nutrition</h2>
      {loading && <Spinner message="Loading nutrition info…" />}
      {!loading && error && (
        <p className="card-empty">Nutrition data unavailable.</p>
      )}
      {!loading && !error && !nutrition?.length && (
        <p className="card-empty">No nutrition data found.</p>
      )}
      {!loading && !error && nutrition?.length > 0 && (
        <ul className="nutrition-list">
          {nutrition.filter(Boolean).map((item, i) => (
            <li key={i} className="nutrition-item">
              <span className="nutrition-name">{item.name}</span>
              {item.description && (
                <span className="nutrition-desc">{item.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
