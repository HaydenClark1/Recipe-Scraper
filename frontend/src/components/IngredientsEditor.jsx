import { useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { searchFoods } from '../api/foods.js'
import { SUPPORTED_UNITS } from '../lib/units.js'
import './IngredientsEditor.css'

function ReplacePanel({ initial, current, onPick }) {
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle')
  const [source, setSource] = useState('local')
  const run = async (src = 'local') => {
    if (q.trim().length < 2) return
    setSource(src)
    setState('loading')
    try {
      const { foods } = await searchFoods(q, src === 'web' ? 'web' : undefined)
      setResults(foods)
      setState(foods.length ? 'idle' : 'empty')
    } catch { setState('error') }
  }
  return (
    <div className="ing-panel">
      {current && <p className="ing-current">Currently: {current}</p>}
      <div className="ing-panel__search">
        <input className="ing-panel__input" placeholder="Search foods…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run('local')} />
        <button className="ing-btn" onClick={() => run('local')} aria-label="Search">Search</button>
      </div>
      <button className="ing-btn ing-btn--web" onClick={() => run('web')} aria-label="Search the web">Search the web</button>
      {state === 'loading' && <p className="ing-note">Searching{source === 'web' ? ' the web' : ''}…</p>}
      {state === 'error' && <p className="ing-note">Search unavailable, try again.</p>}
      {state === 'empty' && <p className="ing-note">No matches — try a simpler term.</p>}
      <ul className="ing-results">
        {results.map((f, i) => (
          <li key={i}>
            <button className="ing-result" onClick={() => onPick(f)}>
              <span className="ing-result__name">{f.food_name}</span>
              <span className="ing-result__basis">{f.food_description}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Native <select> grouped by Mass/Volume — scrolls on its own and is the most
// reliable dropdown inside the Capacitor webview on phones.
const UNIT_GROUPS = ['Count', 'Mass', 'Volume']

function AmountPanel({ onApply }) {
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  const canApply = qty.trim() !== '' && unit !== ''
  return (
    <div className="ing-panel ing-panel--row">
      <input className="ing-panel__qty" inputMode="decimal" placeholder="Qty" value={qty}
        onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
      <select className="ing-panel__unit" value={unit}
        onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
        <option value="" disabled>Select unit</option>
        {UNIT_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {SUPPORTED_UNITS.filter((u) => u.group === group).map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <button className="ing-btn" disabled={!canApply}
        onClick={() => canApply && onApply(Number(qty), unit)} aria-label="Apply amount">Apply amount</button>
    </div>
  )
}

function ManualPanel({ onApply }) {
  const [v, setV] = useState({ calories: '', fat: '', carbs: '', protein: '' })
  const num = (x) => (x === '' ? 0 : Number(x))
  const field = (key, label) => (
    <label className="ing-manual__field">
      <span>{label}</span>
      <input inputMode="decimal" value={v[key]} aria-label={label}
        onChange={(e) => setV((s) => ({ ...s, [key]: e.target.value }))} />
    </label>
  )
  return (
    <div className="ing-panel">
      <div className="ing-manual__grid">
        {field('calories', 'Calories')}
        {field('fat', 'Fat')}
        {field('carbs', 'Carbs')}
        {field('protein', 'Protein')}
      </div>
      <button className="ing-btn" aria-label="Apply manual"
        onClick={() => onApply({ calories: num(v.calories), fat: num(v.fat), carbs: num(v.carbs), protein: num(v.protein) })}>
        Apply manual
      </button>
    </div>
  )
}

function nutritionSummary(n) {
  if (!n) return null
  if (n.excluded) return 'excluded'
  if (n.manual) return `manual · ${n.manual.calories} cal`
  if (n.food) {
    const parts = [n.food.foodName]
    if (n.amount) parts.push(`${n.amount.quantity} ${n.amount.unit}`)
    return parts.join(' · ')
  }
  return null
}

function MatchLine({ result, onNeedAmount }) {
  if (!result) return null
  return (
    <div className="ing-row__match">
      {result.matched
        ? <span>matched to "{result.matchedName}"{result.grams != null ? ` · ${result.grams} g` : ''}</span>
        : <span className="ing-row__nomatch">no match</span>}
      {result.needsAmount && (
        <button className="ing-badge ing-badge--warn" onClick={onNeedAmount} aria-label="Needs amount">⚠ Needs amount</button>
      )}
    </div>
  )
}

function Row({ item, editor, autoItem }) {
  const [panel, setPanel] = useState(null)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const summary = nutritionSummary(item.nutrition)
  return (
    <li ref={setNodeRef} style={style} className="ing-row">
      <div className="ing-row__top">
        <button className="ing-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
        <input className="ing-row__text" value={item.text} aria-label="Ingredient text"
          onChange={(e) => editor.editIngredientText(item.id, e.target.value)} />
        <button className="ing-btn ing-btn--danger" aria-label="Delete ingredient"
          onClick={() => editor.deleteIngredient(item.id)}>Del</button>
      </div>
      {summary && <div className="ing-row__summary">{summary}</div>}
      {!item.nutrition && <MatchLine result={autoItem} onNeedAmount={() => setPanel('amount')} />}
      <div className="ing-row__actions">
        <button className="ing-btn" aria-label="Replace" onClick={() => setPanel(panel === 'replace' ? null : 'replace')}>Replace</button>
        <button className="ing-btn" aria-label="Amount" onClick={() => setPanel(panel === 'amount' ? null : 'amount')}>Amount</button>
        <button className="ing-btn" aria-label="Manual" onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>Manual</button>
        <button className="ing-btn" aria-label="Exclude" onClick={() => editor.exclude(item.id)}>Exclude</button>
        <button className="ing-btn" aria-label="Reset nutrition" onClick={() => editor.clearNutrition(item.id)}>Reset</button>
      </div>
      {panel === 'replace' && <ReplacePanel initial={item.text} current={autoItem && autoItem.matched ? autoItem.matchedName : null} onPick={(f) => { editor.setFood(item.id, f); setPanel(null) }} />}
      {panel === 'amount' && <AmountPanel onApply={(q, u) => { editor.setAmount(item.id, q, u); setPanel(null) }} />}
      {panel === 'manual' && <ManualPanel onApply={(m) => { editor.setManual(item.id, m); setPanel(null) }} />}
    </li>
  )
}

export function IngredientsEditor({ editor, items, nutritionItems = [], onClose }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) editor.reorderIngredients(active.id, over.id)
  }
  return (
    <div className="ing-editor" role="dialog" aria-label="Edit ingredients">
      <header className="ing-editor__header">
        <span>Edit ingredients</span>
        <button className="ing-editor__close" onClick={onClose} aria-label="Close">Close</button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="ing-editor__list">
            {items.map((item, i) => <Row key={item.id} item={item} editor={editor} autoItem={nutritionItems[i]} />)}
          </ul>
        </SortableContext>
      </DndContext>
      <footer className="ing-editor__footer">
        <button className="ing-btn ing-btn--add" onClick={editor.addIngredient} aria-label="Add ingredient">+ Add ingredient</button>
        <button className="ing-btn ing-btn--done" onClick={onClose} aria-label="Done editing ingredients">Done</button>
      </footer>
    </div>
  )
}
