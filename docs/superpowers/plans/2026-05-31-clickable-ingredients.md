# Clickable Ingredients in Instructions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users tap an ingredient mentioned in an instruction step and see a popover with its amount, fully offline (no third-party APIs), replacing the current Spoonacular-backed highlighting.

**Architecture:** Three pure frontend logic modules (`ingredientParser`, `inlineAmount`, `highlightInstruction`) feed a rewritten `InstructionsCard` that renders clickable highlighted words; tapping opens a portal-rendered `IngredientPopover`. The Spoonacular endpoint and its API client are removed.

**Tech Stack:** React 19, Vite 8, Vitest 4 + @testing-library/react + jsdom (frontend). Node/Express (backend).

---

## Conventions for every command in this plan

- All frontend commands run **from the `frontend/` directory**.
- Run a single test file: `npx vitest run <path>`.
- Frontend test globals (`describe`/`it`/`expect`/`vi`) are enabled via `vite.config.js` (`test.globals: true`); RTL matchers are loaded from `src/test/setup.js`. You may still import them explicitly — existing tests do.
- Commit after each task. Use the exact commit messages given.

## File Structure

| File | Responsibility |
|------|----------------|
| `frontend/src/lib/ingredientParser.js` (create) | Parse one ingredient string → `{ raw, amountText, name, display, matchTerms }`. Exports `UNITS`. |
| `frontend/src/lib/inlineAmount.js` (create) | `hasInlineAmountBefore(tokens, i)` — detect an amount already stated before a word. |
| `frontend/src/lib/highlightInstruction.js` (create) | `buildSegments(step, parsedIngredients)` — split a step into plain/clickable segments. |
| `frontend/src/components/IngredientPopover.jsx` (create) | Portal+fixed popover bubble anchored to a tapped word; self-dismissing. |
| `frontend/src/components/IngredientPopover.css` (create) | Popover styling. |
| `frontend/src/components/cards/InstructionsCard.jsx` (rewrite) | Render steps via `buildSegments`; manage popover; no network call. |
| `frontend/src/components/cards/InstructionsCard.css` (modify) | Add `.ingredient-link`; drop `.highlight`. |
| `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx` (rewrite) | Component tests for the new behavior. |
| `frontend/src/api/recipes.js` (modify) | Remove `parseIngredients`. |
| `backend/server.js` (modify) | Remove `POST /parse-ingredients-api`. |

---

## Task 1: Ingredient parser

**Files:**
- Create: `frontend/src/lib/ingredientParser.js`
- Test: `frontend/src/lib/__tests__/ingredientParser.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/ingredientParser.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseIngredientLine } from '../ingredientParser.js'

describe('parseIngredientLine', () => {
  it('splits quantity, unit, and name', () => {
    const r = parseIngredientLine('1/2 tsp Italian seasoning')
    expect(r.amountText).toBe('1/2 tsp')
    expect(r.name).toBe('Italian seasoning')
    expect(r.display).toBe('1/2 tsp Italian seasoning')
  })

  it('handles a count with no unit', () => {
    const r = parseIngredientLine('2 boneless skinless chicken breasts')
    expect(r.amountText).toBe('2')
    expect(r.name).toBe('boneless skinless chicken breasts')
    expect(r.display).toBe('2 boneless skinless chicken breasts')
  })

  it('drops prep notes after a comma for name and display', () => {
    const r = parseIngredientLine('1 Tbsp butter, melted')
    expect(r.amountText).toBe('1 Tbsp')
    expect(r.name).toBe('butter')
    expect(r.display).toBe('1 Tbsp butter')
  })

  it('drops parentheticals', () => {
    const r = parseIngredientLine('1 cup flour (sifted)')
    expect(r.name).toBe('flour')
  })

  it('handles mixed numbers and ranges', () => {
    expect(parseIngredientLine('1 1/2 cups sugar').amountText).toBe('1 1/2 cups')
    expect(parseIngredientLine('2-3 cloves garlic').amountText).toBe('2-3 cloves')
  })

  it('handles an amount-less line', () => {
    const r = parseIngredientLine('Salt and pepper to taste')
    expect(r.amountText).toBeNull()
    expect(r.display).toBe('Salt and pepper to taste')
  })

  it('builds match terms including singular/plural head noun', () => {
    const r = parseIngredientLine('2 boneless skinless chicken breasts')
    expect(r.matchTerms).toContain('boneless skinless chicken breasts')
    expect(r.matchTerms).toContain('breast')
    expect(r.matchTerms).toContain('breasts')
  })

  it('includes the full multiword name as a match term', () => {
    expect(parseIngredientLine('1/2 tsp Italian seasoning').matchTerms)
      .toContain('italian seasoning')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/ingredientParser.test.js`
Expected: FAIL — `parseIngredientLine` is not exported / file missing.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/ingredientParser.js`:

```js
const UNIT_WORDS = [
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbl',
  'cup', 'cups', 'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'ml', 'liter', 'liters', 'l',
  'clove', 'cloves', 'can', 'cans', 'pinch', 'pinches', 'dash', 'dashes',
  'slice', 'slices', 'stick', 'sticks', 'package', 'packages', 'pkg',
  'handful', 'handfuls', 'quart', 'quarts', 'pint', 'pints', 'gallon', 'gallons',
]

export const UNITS = new Set(UNIT_WORDS)

// Connectors and trailing qualifiers that should never be a "head noun".
const STOPWORDS = new Set([
  'and', 'or', 'to', 'of', 'the', 'with', 'for', 'a', 'an',
  'taste', 'serving', 'garnish', 'needed', 'divided', 'more', 'plus',
])

const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/

function singularize(word) {
  if (/ies$/i.test(word)) return word.replace(/ies$/i, 'y')
  if (/(ches|shes|sses|xes|zes)$/i.test(word)) return word.replace(/es$/i, '')
  if (/s$/i.test(word) && !/ss$/i.test(word)) return word.replace(/s$/i, '')
  return word
}

function pluralize(word) {
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, 'ies')
  if (/(ch|sh|s|x|z)$/i.test(word)) return word + 'es'
  return word + 's'
}

export function parseIngredientLine(raw) {
  const original = String(raw == null ? '' : raw).trim()

  // Remove parentheticals and a trailing comma clause for name extraction.
  let work = original.replace(/\([^)]*\)/g, ' ')
  const comma = work.indexOf(',')
  if (comma !== -1) work = work.slice(0, comma)
  work = work.replace(/\s+/g, ' ').trim()

  // Leading quantity.
  let amountText = null
  let rest = work
  const qty = work.match(QTY_RE)
  if (qty) {
    const quantity = qty[1].replace(/\s+/g, ' ').trim()
    rest = work.slice(qty[0].length)
    const tokens = rest.split(' ').filter(Boolean)
    let unit = null
    if (tokens.length && UNITS.has(tokens[0].toLowerCase().replace(/\.$/, ''))) {
      unit = tokens.shift().replace(/\.$/, '')
      rest = tokens.join(' ')
    }
    amountText = unit ? `${quantity} ${unit}` : quantity
  }

  const name = rest.trim() || original
  const display = [amountText, name].filter(Boolean).join(' ').trim() || original

  // Match terms: full name + singular/plural head noun.
  const lowerName = name.toLowerCase()
  const terms = new Set()
  if (lowerName.length >= 3) terms.add(lowerName)
  const words = lowerName.split(' ').filter((w) => w && !STOPWORDS.has(w))
  const head = words[words.length - 1]
  if (head && head.length >= 3) {
    const base = singularize(head)
    terms.add(head)
    terms.add(base)
    terms.add(pluralize(base))
  }
  const matchTerms = [...terms].filter((t) => t.length >= 3)

  return { raw: original, amountText, name, display, matchTerms }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/ingredientParser.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/ingredientParser.js frontend/src/lib/__tests__/ingredientParser.test.js
git commit -m "feat: add offline ingredient line parser"
```

---

## Task 2: Inline-amount detector

**Files:**
- Create: `frontend/src/lib/inlineAmount.js`
- Test: `frontend/src/lib/__tests__/inlineAmount.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/inlineAmount.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { hasInlineAmountBefore } from '../inlineAmount.js'

describe('hasInlineAmountBefore', () => {
  it('detects "1 Tbsp of butter"', () => {
    const tokens = ['add', 'the', 'olive', 'oil', 'and', '1', 'tbsp', 'of', 'butter']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('butter'))).toBe(true)
  })

  it('is false when no amount precedes the word', () => {
    const tokens = ['season', 'with', 'italian', 'seasoning']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('italian'))).toBe(false)
  })

  it('detects a bare number with no unit ("2 eggs")', () => {
    const tokens = ['beat', '2', 'eggs']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('eggs'))).toBe(true)
  })

  it('detects a fraction directly before the word', () => {
    const tokens = ['add', '1/2', 'butter']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('butter'))).toBe(true)
  })

  it('is false at the start of the step', () => {
    expect(hasInlineAmountBefore(['butter'], 0)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/inlineAmount.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/inlineAmount.js`:

```js
import { UNITS } from './ingredientParser.js'

const NUMBER_RE = /^\d+([./]\d+)?$/ // 1, 1.5, 1/2
const CONNECTORS = new Set(['of', 'the'])

function clean(token) {
  return String(token).toLowerCase().replace(/[^a-z0-9/.]/g, '')
}

// `tokens` is the lowercased word list of one step. `matchStartIndex` is the
// index of the first word of a matched ingredient. Returns true when an amount
// (number, optionally followed by a unit) is stated immediately before it.
export function hasInlineAmountBefore(tokens, matchStartIndex) {
  let i = matchStartIndex - 1
  while (i >= 0 && CONNECTORS.has(clean(tokens[i]))) i--
  if (i >= 0 && UNITS.has(clean(tokens[i]))) i--
  if (i >= 0 && NUMBER_RE.test(clean(tokens[i]))) return true
  return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/inlineAmount.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/inlineAmount.js frontend/src/lib/__tests__/inlineAmount.test.js
git commit -m "feat: add inline-amount detector for instruction text"
```

---

## Task 3: Instruction segment builder

**Files:**
- Create: `frontend/src/lib/highlightInstruction.js`
- Test: `frontend/src/lib/__tests__/highlightInstruction.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/highlightInstruction.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildSegments } from '../highlightInstruction.js'
import { parseIngredientLine } from '../ingredientParser.js'

const ingredients = [
  '1/2 tsp Italian seasoning',
  '2 boneless skinless chicken breasts',
  '2 Tbsp butter',
  '2 Tbsp olive oil',
].map(parseIngredientLine)

function clickable(segs) {
  return segs.filter((s) => s.ingredient).map((s) => s.text)
}

describe('buildSegments', () => {
  it('makes an ingredient without an inline amount clickable', () => {
    const step = 'Season each breast with Italian seasoning, salt, and black pepper.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).toContain('Italian seasoning')
    // "breast" matches the chicken breasts head noun
    expect(clickable(segs)).toContain('breast')
  })

  it('does not make a word clickable when the amount is already inline', () => {
    const step = 'Heat a large skillet and add the olive oil and 1 Tbsp of butter.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).not.toContain('butter')
  })

  it('reassembles the full original text across segments', () => {
    const step = 'Season each breast with Italian seasoning, salt, and black pepper.'
    const segs = buildSegments(step, ingredients)
    expect(segs.map((s) => s.text).join('')).toBe(step)
  })

  it('keeps trailing punctuation out of the clickable span', () => {
    const step = 'Add Italian seasoning, then stir.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).toContain('Italian seasoning')
    expect(clickable(segs)).not.toContain('Italian seasoning,')
  })

  it('returns the whole step as one plain segment when nothing matches', () => {
    const segs = buildSegments('Preheat the oven to 350 degrees.', ingredients)
    expect(segs).toEqual([{ text: 'Preheat the oven to 350 degrees.', ingredient: null }])
  })

  it('exposes the matched ingredient so the popover can show its amount', () => {
    const segs = buildSegments('Sprinkle Italian seasoning over top.', ingredients)
    const seg = segs.find((s) => s.ingredient)
    expect(seg.ingredient.display).toBe('1/2 tsp Italian seasoning')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/highlightInstruction.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/highlightInstruction.js`:

```js
import { hasInlineAmountBefore } from './inlineAmount.js'

function norm(word) {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

// Returns an ordered list of { text, ingredient } segments covering the whole
// step. Segments with a non-null `ingredient` are the clickable highlights.
export function buildSegments(stepText, parsedIngredients) {
  const text = String(stepText == null ? '' : stepText)

  // Tokenize into words with their character offsets.
  const words = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text)) !== null) {
    words.push({ start: m.index, end: m.index + m[0].length })
  }
  const lw = words.map((w) => norm(text.slice(w.start, w.end)))

  // Candidate (ingredient, term-words) pairs, longest first.
  const candidates = []
  for (const ing of parsedIngredients) {
    for (const term of ing.matchTerms) {
      candidates.push({ ingredient: ing, words: term.split(' ').filter(Boolean), len: term.length })
    }
  }
  candidates.sort((a, b) => b.words.length - a.words.length || b.len - a.len)

  // Assign non-overlapping matches.
  const matchAt = new Array(words.length).fill(null)
  const used = new Array(words.length).fill(false)
  for (const c of candidates) {
    for (let i = 0; i + c.words.length <= words.length; i++) {
      let ok = true
      for (let j = 0; j < c.words.length; j++) {
        if (used[i + j] || lw[i + j] !== c.words[j]) { ok = false; break }
      }
      if (!ok) continue
      for (let j = 0; j < c.words.length; j++) used[i + j] = true
      if (hasInlineAmountBefore(lw, i)) continue // amount already given → plain
      matchAt[i] = { ingredient: c.ingredient, span: c.words.length }
    }
  }

  // Emit segments.
  const segments = []
  let cursor = 0
  let i = 0
  while (i < words.length) {
    const match = matchAt[i]
    if (match) {
      const startWord = words[i]
      const endWord = words[i + match.span - 1]
      if (startWord.start > cursor) {
        segments.push({ text: text.slice(cursor, startWord.start), ingredient: null })
      }
      let segText = text.slice(startWord.start, endWord.end)
      const trail = segText.match(/[^\p{L}\p{N}]+$/u)
      let trailing = ''
      if (trail) {
        trailing = trail[0]
        segText = segText.slice(0, segText.length - trailing.length)
      }
      segments.push({ text: segText, ingredient: match.ingredient })
      if (trailing) segments.push({ text: trailing, ingredient: null })
      cursor = endWord.end
      i += match.span
    } else {
      i += 1
    }
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), ingredient: null })
  if (segments.length === 0) segments.push({ text, ingredient: null })
  return segments
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/highlightInstruction.test.js`
Expected: PASS (6 tests).

> Note: the "nothing matches" test expects a single segment equal to the full
> text. The empty-words path and the `cursor < text.length` tail both produce
> that; the final `if (segments.length === 0)` guard covers an empty string.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/highlightInstruction.js frontend/src/lib/__tests__/highlightInstruction.test.js
git commit -m "feat: add instruction segment builder for clickable ingredients"
```

---

## Task 4: Ingredient popover component

**Files:**
- Create: `frontend/src/components/IngredientPopover.jsx`
- Create: `frontend/src/components/IngredientPopover.css`
- Test: `frontend/src/components/__tests__/IngredientPopover.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/__tests__/IngredientPopover.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IngredientPopover } from '../IngredientPopover.jsx'

function makeAnchor() {
  const el = document.createElement('button')
  document.body.appendChild(el)
  return el
}

describe('IngredientPopover', () => {
  it('renders the amount text as a tooltip', () => {
    render(
      <IngredientPopover anchorEl={makeAnchor()} text="1/2 tsp Italian seasoning" onClose={() => {}} />
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('1/2 tsp Italian seasoning')
  })

  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    render(<IngredientPopover anchorEl={makeAnchor()} text="2 eggs" onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/__tests__/IngredientPopover.test.jsx`
Expected: FAIL — component missing.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/IngredientPopover.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './IngredientPopover.css'

// Portal + position:fixed so the bubble is unaffected by the carousel's
// transformed ancestors. Viewport coordinates come straight from the anchor's
// bounding rect; any scroll dismisses the popover.
export function IngredientPopover({ anchorEl, text, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorEl) return
    const a = anchorEl.getBoundingClientRect()
    setPos({ top: a.top - 8, left: a.left + a.width / 2 })
  }, [anchorEl, text])

  useEffect(() => {
    const onDocPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target) && e.target !== anchorEl) onClose()
    }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchorEl, onClose])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="ingredient-popover"
      style={{ top: pos.top, left: pos.left }}
    >
      {text}
      <span className="ingredient-popover__arrow" />
    </div>,
    document.body
  )
}
```

Create `frontend/src/components/IngredientPopover.css`:

```css
.ingredient-popover {
  position: fixed;
  transform: translate(-50%, -100%);
  z-index: 1000;
  max-width: 220px;
  padding: 8px 12px;
  background: var(--text-primary);
  color: var(--surface);
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.4;
  font-weight: 600;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);
  pointer-events: none;
}

.ingredient-popover__arrow {
  position: absolute;
  bottom: -5px;
  left: 50%;
  width: 10px;
  height: 10px;
  background: var(--text-primary);
  transform: translateX(-50%) rotate(45deg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/__tests__/IngredientPopover.test.jsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/IngredientPopover.jsx frontend/src/components/IngredientPopover.css frontend/src/components/__tests__/IngredientPopover.test.jsx
git commit -m "feat: add IngredientPopover bubble component"
```

---

## Task 5: Rewrite InstructionsCard to use the new pipeline

**Files:**
- Modify: `frontend/src/components/cards/InstructionsCard.jsx` (full rewrite)
- Modify: `frontend/src/components/cards/InstructionsCard.css`
- Rewrite test: `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx`

- [ ] **Step 1: Replace the component test**

Replace the entire contents of `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx` with:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstructionsCard } from '../InstructionsCard.jsx'

const recipe = {
  ingredients: [
    '1/2 tsp Italian seasoning',
    '2 boneless skinless chicken breasts',
    '2 Tbsp butter',
    '2 Tbsp olive oil',
  ],
  instructions: [
    'Season each breast with Italian seasoning, salt, and black pepper.',
    'Heat a large skillet over medium heat and add the olive oil and 1 Tbsp of butter.',
  ],
}

describe('InstructionsCard', () => {
  it('renders all instruction steps', () => {
    render(<InstructionsCard recipe={recipe} />)
    expect(screen.getByText(/Season each breast/)).toBeInTheDocument()
    expect(screen.getByText(/Heat a large skillet/)).toBeInTheDocument()
  })

  it('makes an ingredient without an inline amount clickable and shows its amount', async () => {
    const user = userEvent.setup()
    render(<InstructionsCard recipe={recipe} />)
    const btn = screen.getByRole('button', { name: 'Italian seasoning' })
    await user.click(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent('1/2 tsp Italian seasoning')
  })

  it('does not make "butter" clickable when the amount is already inline', () => {
    render(<InstructionsCard recipe={recipe} />)
    expect(screen.queryByRole('button', { name: 'butter' })).toBeNull()
  })

  it('renders empty state when there are no instructions', () => {
    render(<InstructionsCard recipe={{ ingredients: [], instructions: [] }} />)
    expect(screen.getByText('No instructions found.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/cards/__tests__/InstructionsCard.test.jsx`
Expected: FAIL — old component still calls `parseIngredients` and renders `<mark>`, so `getByRole('button', { name: 'Italian seasoning' })` is not found.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `frontend/src/components/cards/InstructionsCard.jsx` with:

```jsx
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
```

- [ ] **Step 4: Update the card styles**

In `frontend/src/components/cards/InstructionsCard.css`, append the clickable-word style (and there is no `.highlight` rule in this file to remove — the old `<mark className="highlight">` was unstyled here; nothing to delete):

```css
.ingredient-link {
  display: inline;
  margin: 0;
  padding: 0 1px;
  border: none;
  background: var(--accent-muted);
  color: var(--accent-dark);
  font: inherit;
  line-height: inherit;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.ingredient-link:active {
  background: var(--accent-light);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/cards/__tests__/InstructionsCard.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/cards/InstructionsCard.jsx frontend/src/components/cards/InstructionsCard.css frontend/src/components/cards/__tests__/InstructionsCard.test.jsx
git commit -m "feat: clickable ingredient amounts in InstructionsCard"
```

---

## Task 6: Remove the Spoonacular dependency

**Files:**
- Modify: `frontend/src/api/recipes.js`
- Modify: `backend/server.js`

- [ ] **Step 1: Remove the API client function**

In `frontend/src/api/recipes.js`, delete the `parseIngredients` export:

```js
export const parseIngredients = (ingredients) =>
  apiClient('/parse-ingredients-api', { ingredients })
```

Leave the other exports (`scrapeRecipe`, `searchRecipes`, `getNutrition`, `saveRecipe`) unchanged.

- [ ] **Step 2: Remove the backend endpoint**

In `backend/server.js`, delete the entire block (the doc comment plus the route), currently around lines 88–124:

```js
/**
 * Used to try and find the ingredients to be used to highlight in instructions page.
 */
app.post("/parse-ingredients-api", async (req,res) => {
    // ...full handler...
})
```

Delete the whole `app.post("/parse-ingredients-api", ...)` handler and its preceding doc comment. Do not remove any other route.

- [ ] **Step 3: Verify nothing still references the removed pieces**

Run (from repo root): search for leftover references.

Run: `npx --yes rg -n "parse-ingredients-api|parseIngredients|process.env.spoon" frontend backend`
Expected: **no matches**. (If `rg` is unavailable, use `git grep -n "parse-ingredients-api\|parseIngredients\|process.env.spoon"`.)

- [ ] **Step 4: Run the full frontend test suite**

Run (from `frontend/`): `npx vitest run`
Expected: PASS — all suites green, including the existing `recipes.test.js` (which never referenced `parseIngredients`) and the rewritten `InstructionsCard.test.jsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/recipes.js backend/server.js
git commit -m "chore: remove Spoonacular parse-ingredients dependency"
```

---

## Final verification

- [ ] From `frontend/`, run `npx vitest run` — entire suite passes.
- [ ] Manually confirm in the app (optional but recommended): scrape a recipe, open Instructions, tap an ingredient name with no inline amount → popover shows `amount + name`; a word that already has an inline amount is plain text.

---

## Self-Review (completed by plan author)

**Spec coverage:** Parser (Task 1), inline-amount suppression (Task 2), matching/segments incl. both spec examples (Task 3), anchored self-dismissing popover (Task 4), InstructionsCard rewrite with "only clickable words highlighted" + reassembled `amount + name` popover content (Task 5), Spoonacular removal across server + API client (Task 6). Carousel-transform concern addressed via portal+fixed popover (Task 4). All spec sections map to a task.

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has an expected result.

**Type consistency:** Parsed object shape `{ raw, amountText, name, display, matchTerms }` is produced in Task 1 and consumed identically in Tasks 3 and 5 (`ingredient.display`, `ing.matchTerms`). `hasInlineAmountBefore(tokens, index)` defined in Task 2, called with `(lw, i)` in Task 3. `buildSegments(step, parsed)` returns `{ text, ingredient }` consumed in Task 5. `UNITS` exported from `ingredientParser.js` (Task 1) and imported in `inlineAmount.js` (Task 2). Consistent throughout.
