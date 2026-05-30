import { useState, useEffect } from 'react'
import { parseIngredients } from '../../api/recipes.js'
import './InstructionsCard.css'

function highlightIngredients(text, names) {
  if (!names.length) return text
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(\\b(?:${escaped.join('|')})\\b)`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) => {
    const isMatch = names.some(n => n.toLowerCase() === part.toLowerCase())
    return isMatch ? <mark key={i} className="highlight">{part}</mark> : part
  })
}

export function InstructionsCard({ recipe }) {
  const [ingNames, setIngNames] = useState([])

  useEffect(() => {
    if (!recipe.ingredients.length) return
    parseIngredients(recipe.ingredients)
      .then(data => {
        const names = Array.isArray(data)
          ? data.map(item => item.name).filter(Boolean)
          : []
        setIngNames(names)
      })
      .catch(() => {})
  }, [recipe.ingredients])

  return (
    <div className="instructions-card">
      <h2 className="card-heading">Instructions</h2>
      {recipe.instructions.length === 0 ? (
        <p className="card-empty">No instructions found.</p>
      ) : (
        <ol className="instructions-list">
          {recipe.instructions.map((step, i) => (
            <li key={i} className="instructions-step">
              {highlightIngredients(step, ingNames)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
