import { useState } from 'react'
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { searchFoods } from '../api/foods.js'
import './IngredientsEditor.css'

function ReplacePanel({ initial, onPick }) {
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle')
  const run = async () => {
    if (q.trim().length < 2) return
    setState('loading')
    try {
      const { foods } = await searchFoods(q)
      setResults(foods)
      setState(foods.length ? 'idle' : 'empty')
    } catch { setState('error') }
  }
  return (
    <div className="ing-panel">
      <div className="ing-panel__search">
        <input className="ing-panel__input" placeholder="Search foods…" value={q}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} />
        <button className="ing-btn" onClick={run} aria-label="Search">Search</button>
      </div>
      {state === 'loading' && <p className="ing-note">Searching…</p>}
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

function AmountPanel({ onApply }) {
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState('')
  return (
    <div className="ing-panel ing-panel--row">
      <input className="ing-panel__qty" inputMode="decimal" placeholder="Qty" value={qty}
        onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
      <input className="ing-panel__unit" placeholder="Unit (g, cup…)" value={unit}
        onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
      <button className="ing-btn" onClick={() => qty && onApply(Number(qty), unit.trim())} aria-label="Apply amount">Apply amount</button>
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

function nutritionSummary(n, autoItem) {
  if (n?.excluded) return 'excluded'
  if (n?.manual) return `manual · ${n.manual.calories} cal`
  if (n?.food) {
    const parts = [n.food.foodName]
    if (n.amount) parts.push(`${n.amount.quantity} ${n.amount.unit}`)
    return parts.join(' · ')
  }
  // No override — show the auto-matched result from the backend
  if (autoItem) {
    if (autoItem.excluded) return 'excluded'
    if (!autoItem.matched) return 'no match found'
    return `${autoItem.matchedName} · ${autoItem.calories} cal`
  }
  return 'not computed'
}

function Row({ item, editor, autoItem }) {
  const [panel, setPanel] = useState(null)
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} className="ing-row">
      <div className="ing-row__top">
        <button className="ing-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
        <input className="ing-row__text" value={item.text} aria-label="Ingredient text"
          onChange={(e) => editor.editIngredientText(item.id, e.target.value)} />
        <button className="ing-btn ing-btn--danger" aria-label="Delete ingredient"
          onClick={() => editor.deleteIngredient(item.id)}>Del</button>
      </div>
      <div className="ing-row__summary">{nutritionSummary(item.nutrition, autoItem)}</div>
      <div className="ing-row__actions">
        <button className="ing-btn" aria-label="Replace" onClick={() => setPanel(panel === 'replace' ? null : 'replace')}>Replace</button>
        <button className="ing-btn" aria-label="Amount" onClick={() => setPanel(panel === 'amount' ? null : 'amount')}>Amount</button>
        <button className="ing-btn" aria-label="Manual" onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>Manual</button>
        <button className="ing-btn" aria-label="Exclude" onClick={() => editor.exclude(item.id)}>Exclude</button>
        <button className="ing-btn" aria-label="Reset nutrition" onClick={() => editor.clearNutrition(item.id)}>Reset</button>
      </div>
      {panel === 'replace' && <ReplacePanel initial={item.text} onPick={(f) => { editor.setFood(item.id, f); setPanel(null) }} />}
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
