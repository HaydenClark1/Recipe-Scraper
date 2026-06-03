import { useState, useEffect } from 'react'
import { getNutrition } from '../../api/recipes.js'
import { Spinner } from '../ui/Spinner.jsx'
import './NutritionCard.css'

const MACROS = [
  { key: 'fat', label: 'Total Fat' },
  { key: 'carbs', label: 'Total Carbohydrate' },
  { key: 'protein', label: 'Protein' },
]

function IngredientBreakdown({ items }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="nutrition-breakdown">
      <button
        className="nutrition-breakdown__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} Ingredient breakdown
      </button>
      {open && (
        <table className="nutrition-breakdown__table">
          <thead>
            <tr>
              <th>Ingredient</th>
              <th>Matched to</th>
              <th>Basis</th>
              <th>Scale</th>
              <th>Cal</th>
              <th>Fat</th>
              <th>Carbs</th>
              <th>Pro</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={item.matched ? '' : 'nutrition-breakdown__unmatched'}>
                <td>{item.name}</td>
                <td>{item.matched ? item.matchedName : '—'}</td>
                <td className="nutrition-breakdown__basis">{item.matched ? item.matchedBasis : '—'}</td>
                <td>{item.matched ? item.scaleFactor : '—'}</td>
                <td>{item.calories}</td>
                <td>{item.fat}g</td>
                <td>{item.carbs}g</td>
                <td>{item.protein}g</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function NutritionCard({ recipe, overrides = [], onEdit }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!recipe.ingredients.length) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(false)
    getNutrition(recipe.ingredients, recipe.servings, overrides)
      .then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) { setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [recipe.ingredients, recipe.servings, overrides])

  const facts = data && (data.perServing || data.totals)
  const matched = data ? data.items.filter((i) => i.matched).length : 0
  const total = data ? data.items.length : 0

  return (
    <div className="nutrition-card">
      <h2 className="card-heading">Nutrition</h2>
      {loading && <Spinner message="Loading nutrition info…" />}
      {!loading && error && <p className="card-empty">Nutrition data unavailable.</p>}
      {!loading && !error && !facts && <p className="card-empty">No nutrition data found.</p>}
      {!loading && !error && facts && (
        <div className="nutrition-label">
          <p className="nutrition-label__basis">
            {data.perServing
              ? `Per serving${data.servings ? ` · makes ${data.servings}` : ''}`
              : 'Whole recipe'}
          </p>
          <div className="nutrition-label__calories">
            <span>Calories</span>
            <span className="nutrition-label__calories-value">{facts.calories}</span>
          </div>
          <ul className="nutrition-label__macros">
            {MACROS.map((m) => (
              <li key={m.key} className="nutrition-label__row">
                <span className="nutrition-label__name">{m.label}</span>
                <span className="nutrition-label__value">{facts[m.key]}g</span>
              </li>
            ))}
          </ul>
          {data.perServing && (
            <p className="nutrition-label__whole">
              Whole recipe: {data.totals.calories} cal · {data.totals.fat}g fat ·{' '}
              {data.totals.carbs}g carbs · {data.totals.protein}g protein
            </p>
          )}
          <p className="nutrition-label__note">
            Estimated{total ? ` · ${matched}/${total} ingredients matched` : ''}
          </p>
          {onEdit && recipe.ingredients.length > 0 && (
            <button className="nutrition-edit-btn" onClick={onEdit} aria-label="Edit ingredients">
              Edit ingredients & nutrition
            </button>
          )}
          <IngredientBreakdown items={data.items} />
        </div>
      )}
    </div>
  )
}
