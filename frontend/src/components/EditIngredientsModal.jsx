import { useState } from 'react'
import { searchFoods } from '../api/foods.js'
import './EditIngredientsModal.css'

function isExcluded(overrides, index) {
  return overrides.some((o) => o.index === index && o.type === 'exclude')
}

function ReplaceView({ ingredient, onPick, onBack }) {
  const [q, setQ] = useState(ingredient)
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle')

  const run = async () => {
    if (q.trim().length < 2) return
    setState('loading')
    try {
      const { foods } = await searchFoods(q)
      setResults(foods)
      setState(foods.length ? 'idle' : 'empty')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="edit-modal" role="dialog" aria-label="Replace ingredient match">
      <header className="edit-modal__header">
        <button className="edit-replace__back" onClick={onBack}>Back</button>
        <span className="edit-modal__title">Replace match</span>
      </header>
      <div className="edit-replace__search">
        <input
          className="edit-replace__input"
          placeholder="Search foods…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
        />
        <button className="edit-replace__go" onClick={run} aria-label="Search">Search</button>
      </div>
      {state === 'loading' && <p className="edit-replace__status">Searching…</p>}
      {state === 'error' && <p className="edit-replace__status">Search unavailable, try again.</p>}
      {state === 'empty' && <p className="edit-replace__status">No matches — try a simpler term.</p>}
      <ul className="edit-replace__results">
        {results.map((f, i) => (
          <li key={i}>
            <button className="edit-replace__result" onClick={() => onPick(f)}>
              <span className="edit-replace__name">{f.food_name}</span>
              <span className="edit-replace__basis">{f.food_description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AmountEditor({ onApply, onCancel }) {
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  return (
    <div className="edit-amount">
      <input
        className="edit-amount__input"
        inputMode="decimal"
        placeholder="Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        aria-label="Quantity"
      />
      <input
        className="edit-amount__input"
        placeholder="Unit (g, cup…)"
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        aria-label="Unit"
      />
      <button
        className="edit-amount__apply"
        onClick={() => qty && onApply(Number(qty), unit.trim())}
        aria-label="Apply amount"
      >
        Apply amount
      </button>
      <button
        className="edit-amount__cancel"
        onClick={onCancel}
        aria-label="Cancel amount"
      >
        Cancel
      </button>
    </div>
  )
}

export function EditIngredientsModal({ ingredients, items, overrides, actions, onClose }) {
  const [replacingIndex, setReplacingIndex] = useState(null)
  const [amountIndex, setAmountIndex] = useState(null)

  if (replacingIndex != null) {
    return (
      <ReplaceView
        ingredient={ingredients[replacingIndex]}
        onBack={() => setReplacingIndex(null)}
        onPick={(food) => {
          actions.replace(replacingIndex, food)
          setReplacingIndex(null)
        }}
      />
    )
  }

  return (
    <div className="edit-modal" role="dialog" aria-label="Edit ingredients">
      <header className="edit-modal__header">
        <span className="edit-modal__title">Edit ingredients</span>
        <button className="edit-modal__close" onClick={onClose} aria-label="Close">Close</button>
      </header>
      <ul className="edit-modal__list">
        {ingredients.map((ing, i) => {
          const item = items[i] || {}
          const excluded = isExcluded(overrides, i)
          return (
            <li key={i} className={`edit-row${excluded ? ' edit-row--excluded' : ''}`}>
              <div className="edit-row__name">{ing}</div>
              <div className="edit-row__match">
                {excluded
                  ? 'excluded'
                  : item.matched
                  ? `${item.matchedName} · ${item.calories} cal`
                  : 'no match'}
              </div>
              <div className="edit-row__actions">
                <button
                  className="edit-row__btn"
                  onClick={() => setReplacingIndex(i)}
                  aria-label="Replace"
                >
                  Replace
                </button>
                <button
                  className="edit-row__btn"
                  onClick={() => setAmountIndex(amountIndex === i ? null : i)}
                  aria-label="Amount"
                >
                  Amount
                </button>
                {excluded ? (
                  <button
                    className="edit-row__btn"
                    onClick={() => actions.unexclude(i)}
                    aria-label="Undo exclude"
                  >
                    Undo
                  </button>
                ) : (
                  <button
                    className="edit-row__btn"
                    onClick={() => actions.exclude(i)}
                    aria-label="Exclude"
                  >
                    Exclude
                  </button>
                )}
              </div>
              {amountIndex === i && (
                <AmountEditor
                  onApply={(q, u) => {
                    actions.setAmount(i, q, u)
                    setAmountIndex(null)
                  }}
                  onCancel={() => setAmountIndex(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
      <footer className="edit-modal__footer">
        <button className="edit-modal__done" onClick={onClose} aria-label="Done editing">
          Done
        </button>
      </footer>
    </div>
  )
}
