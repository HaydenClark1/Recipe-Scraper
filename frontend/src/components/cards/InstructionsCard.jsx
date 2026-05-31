import { useMemo, useState, useCallback } from 'react'
import { parseIngredientLine } from '../../lib/ingredientParser.js'
import { buildSegments } from '../../lib/highlightInstruction.js'
import { IngredientPopover } from '../IngredientPopover.jsx'
import './InstructionsCard.css'

export function InstructionsCard({ recipe }) {
  const parsed = useMemo(
    () => recipe.ingredients.map(parseIngredientLine),
    [recipe.ingredients]
  )
  const [popover, setPopover] = useState(null) // { anchorEl, text } | null

  const handleClick = useCallback((event, ingredient) => {
    const anchorEl = event.currentTarget
    setPopover((prev) =>
      prev && prev.anchorEl === anchorEl ? null : { anchorEl, text: ingredient.display }
    )
  }, [])

  return (
    <div className="instructions-card">
      <h2 className="card-heading">Instructions</h2>
      {recipe.instructions.length === 0 ? (
        <p className="card-empty">No instructions found.</p>
      ) : (
        <ol className="instructions-list">
          {recipe.instructions.map((step, i) => (
            <li key={i} className="instructions-step">
              {buildSegments(step, parsed).map((seg, j) =>
                seg.ingredient ? (
                  <button
                    key={j}
                    type="button"
                    className="ingredient-link"
                    onClick={(e) => handleClick(e, seg.ingredient)}
                  >
                    {seg.text}
                  </button>
                ) : (
                  <span key={j}>{seg.text}</span>
                )
              )}
            </li>
          ))}
        </ol>
      )}
      {popover && (
        <IngredientPopover
          anchorEl={popover.anchorEl}
          text={popover.text}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}
