# Ingredient Search & Saved-Recipe Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface ingredient matches in the editor, let users browse multiple matches + search the web (FatSecret), prompt for uncalculable amounts, and add server-backed saved-recipe search.

**Architecture:** Backend stays a thin Express app with pure, unit-tested modules (`node:test`). `combineNutrition` gains a per-item `needsAmount` flag; `fatsecretClient` gains a multi-result `searchFoods`; `/search-foods` gains a `source` param; a new `/saved-recipes/search` route fuzzy-matches a user's recipes. Frontend wires the already-passed `nutritionItems` into editor rows, adds a web-search toggle + amount badge, and a debounced search box on the Saved page (Vitest + Testing Library).

**Tech Stack:** Node/Express, Prisma, Fuse.js, oauth-1.0a (FatSecret), React (Vite), Vitest, @testing-library/react.

**Commands:** Backend tests `cd backend && npm test` (or single file: `node --test nutrition/__tests__/combine.test.js`). Frontend tests `cd frontend && npm run test:run` (or single file: `npm run test:run -- src/components/__tests__/IngredientsEditor.test.jsx`).

---

## File Structure

**Backend**
- Modify: `backend/nutrition/combine.js` — add `needsAmount` to items.
- Modify: `backend/nutrition/fatsecretClient.js` — add `pickFoods` + `searchFoods` (plural).
- Modify: `backend/server.js` — `source` param on `/search-foods`, wire FatSecret multi-result.
- Modify: `backend/recipes/savedRecipeHandlers.js` — add `makeSearchHandler`.
- Modify: `backend/recipes/savedRecipeRoutes.js` — register `GET /search`.
- Test: `backend/nutrition/__tests__/combine.test.js`, `backend/nutrition/__tests__/fatsecretClient.test.js`, `backend/recipes/__tests__/savedRecipeHandlers.test.js`.

**Frontend**
- Modify: `frontend/src/api/foods.js` — `searchFoods(q, source)`.
- Modify: `frontend/src/api/savedRecipes.js` — `searchSavedRecipes(q)`.
- Modify: `frontend/src/components/IngredientsEditor.jsx` — match line, web-search toggle, needs-amount badge, pass `nutritionItems` per row.
- Modify: `frontend/src/components/IngredientsEditor.css` — styles for match line / badge / web button.
- Modify: `frontend/src/pages/SavedPage.jsx` — debounced search box.
- Modify: `frontend/src/pages/SavedPage.css` — search box styles.
- Test: `frontend/src/components/__tests__/IngredientsEditor.test.jsx`, `frontend/src/pages/__tests__/SavedPage.test.jsx` (new).

---

## Task 1: `needsAmount` flag in combineNutrition

**Files:**
- Modify: `backend/nutrition/combine.js:88-150`
- Test: `backend/nutrition/__tests__/combine.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `backend/nutrition/__tests__/combine.test.js`:

```javascript
test('flags needsAmount when a bare count matches a per-mass basis', async () => {
  const searchFood = fake({
    'chicken': { food_name: 'Chicken breast', food_description: 'Per 100g - Calories: 165kcal | Fat: 3.6g | Carbs: 0g | Protein: 31g' },
  })
  const r = await combineNutrition(['1 chicken breast'], null, { searchFood })
  assert.strictEqual(r.items[0].matched, true)
  assert.strictEqual(r.items[0].needsAmount, true)
})

test('does not flag needsAmount when grams are known', async () => {
  const searchFood = fake({
    sugar: { food_name: 'Sugar', food_description: 'Per 100g - Calories: 400kcal | Fat: 0g | Carbs: 100g | Protein: 0g' },
  })
  const r = await combineNutrition(['200 g sugar'], null, { searchFood })
  assert.strictEqual(r.items[0].needsAmount, false)
})

test('unmatched and excluded items report needsAmount false', async () => {
  const r = await combineNutrition(['1 pinch unobtainium'], null, { searchFood: fake({}) })
  assert.strictEqual(r.items[0].needsAmount, false)
})
```

Note: `cleanForSearch('1 chicken breast')` → `parseIngredient` yields `name: 'chicken breast'`, then `cleanForSearch` strips `breast` → `'chicken'`, so the fake is keyed by `'chicken'`. `parseIngredient('1 chicken breast')` yields `quantity: 1, unit: null` (breast is not a unit), so `grams` is null.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test nutrition/__tests__/combine.test.js`
Expected: FAIL — `needsAmount` is `undefined`, not `true`/`false`.

- [ ] **Step 3: Implement**

In `backend/nutrition/combine.js`, add `needsAmount: false` to the excluded, manual, and unmatched item objects, and compute it for the matched item.

Excluded push (around line 60) — add field:
```javascript
items.push({ name, matched: false, excluded: true, overridden: true, needsAmount: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
```

Manual item object (around line 66) — add field after `overridden: true,`:
```javascript
        needsAmount: false,
```

Unmatched push (around line 98) — add field:
```javascript
      items.push({ name, matched: false, excluded: false, overridden: !!(ov.replace || ov.amount), needsAmount: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
```

Matched item object (around line 131) — add field after `overridden: ...,`:
```javascript
      needsAmount: approx && grams == null,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test nutrition/__tests__/combine.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/combine.js backend/nutrition/__tests__/combine.test.js
git commit -m "feat: flag ingredient lines that need a specified amount"
```

---

## Task 2: FatSecret multi-result `searchFoods`

**Files:**
- Modify: `backend/nutrition/fatsecretClient.js`
- Test: `backend/nutrition/__tests__/fatsecretClient.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `backend/nutrition/__tests__/fatsecretClient.test.js`:

```javascript
const { pickFoods } = require('../fatsecretClient')

test('pickFoods returns all foods from an array', () => {
  const data = { foods: { food: [{ food_name: 'A' }, { food_name: 'B' }] } }
  assert.deepStrictEqual(pickFoods(data), [{ food_name: 'A' }, { food_name: 'B' }])
})

test('pickFoods wraps a single food object in an array', () => {
  const data = { foods: { food: { food_name: 'Solo' } } }
  assert.deepStrictEqual(pickFoods(data), [{ food_name: 'Solo' }])
})

test('pickFoods returns [] when there are no foods', () => {
  assert.deepStrictEqual(pickFoods({ foods: {} }), [])
  assert.deepStrictEqual(pickFoods({}), [])
  assert.deepStrictEqual(pickFoods(null), [])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test nutrition/__tests__/fatsecretClient.test.js`
Expected: FAIL — `pickFoods` is not a function / not exported.

- [ ] **Step 3: Implement**

In `backend/nutrition/fatsecretClient.js`, add `pickFoods` next to `pickFood`:

```javascript
function pickFoods(data) {
  const food = data && data.foods && data.foods.food
  if (!food) return []
  return Array.isArray(food) ? food : [food]
}
```

Add a `searchFoods` (plural) that reuses the same signed-request flow as `searchFood` but returns the full list mapped to the `{ food_name, food_description }` shape. Replace the existing `searchFood` with a shared internal request:

```javascript
async function requestFoods(name) {
  const oauth = makeOAuth()
  const data = { method: 'foods.search', search_expression: name, format: 'json' }
  const oauthParams = oauth.authorize({ url: ENDPOINT, method: 'GET', data })
  const qs = new URLSearchParams({ ...data, ...oauthParams }).toString()

  const res = await fetch(`${ENDPOINT}?${qs}`, { method: 'GET' })
  if (!res.ok) throw new Error(`FatSecret HTTP ${res.status}`)
  const json = await res.json()
  if (json && json.error) throw new Error(`FatSecret error: ${json.error.message || 'unknown'}`)
  return json
}

async function searchFood(name) {
  return pickFood(await requestFoods(name))
}

async function searchFoods(name) {
  return pickFoods(await requestFoods(name)).map((f) => ({
    food_name: f.food_name,
    food_description: f.food_description,
  }))
}
```

Update the exports line:
```javascript
module.exports = { searchFood, searchFoods, pickFood, pickFoods, ENDPOINT }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && node --test nutrition/__tests__/fatsecretClient.test.js`
Expected: PASS (existing `pickFood` tests + new `pickFoods` tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/fatsecretClient.js backend/nutrition/__tests__/fatsecretClient.test.js
git commit -m "feat: add FatSecret multi-result searchFoods"
```

---

## Task 3: `source` param on /search-foods

**Files:**
- Modify: `backend/server.js:13,180-190`

This wires the route; there is no server-level test harness in this repo (routes are verified manually), so this task ends with a manual check rather than an automated test.

- [ ] **Step 1: Import the FatSecret multi-result function**

In `backend/server.js`, change the FatSecret import (line 13) from:
```javascript
const { searchFood: fatsecretSearch } = require("./nutrition/fatsecretClient");
```
to:
```javascript
const { searchFood: fatsecretSearch, searchFoods: fatsecretSearchFoods } = require("./nutrition/fatsecretClient");
```

- [ ] **Step 2: Branch the handler on `source`**

Replace the `/search-foods` handler (lines 180-190) with:
```javascript
app.get('/search-foods', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const source = (req.query.source || 'local').toString();
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  try {
    let foods;
    if (source === 'web') {
      try { foods = await fatsecretSearchFoods(q); } catch { foods = []; }
    } else {
      foods = await resolveFoods(q);
    }
    return res.status(200).json({ foods });
  } catch (err) {
    console.error('Food search failed:', err.message);
    return res.status(500).json({ error: 'Failed to search foods' });
  }
});
```

- [ ] **Step 3: Manual verification**

Run: `cd backend && node server.js` (requires FatSecret env vars for the web branch).
In another shell:
```bash
curl "http://localhost:7000/search-foods?q=chicken"          # local (USDA) — array of foods
curl "http://localhost:7000/search-foods?q=chicken&source=web"  # FatSecret — array of foods
```
Expected: both return `{ "foods": [ ... ] }`; `source=web` results come from FatSecret. If FatSecret env vars are absent, the web call returns `{ "foods": [] }` (handled gracefully).

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat: support source=web (FatSecret) on /search-foods"
```

---

## Task 4: Saved-recipe search endpoint

**Files:**
- Modify: `backend/recipes/savedRecipeHandlers.js`
- Modify: `backend/recipes/savedRecipeRoutes.js`
- Test: `backend/recipes/__tests__/savedRecipeHandlers.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `backend/recipes/__tests__/savedRecipeHandlers.test.js` (and add `makeSearchHandler` to the destructured import at the top of the file):

```javascript
function searchPrisma(rows) {
  return { savedRecipe: { findMany: async ({ where }) => {
    assert.strictEqual(where.userId, 9)
    return rows
  } } }
}

const sampleRows = [
  { id: 1, title: 'Chicken Soup', image: null, ingredients: '["2 chicken breasts","salt"]', instructions: '["cook"]', servings: null, sourceUrl: null, createdAt: 't' },
  { id: 2, title: 'Veggie Stir Fry', image: null, ingredients: '["broccoli","soy sauce"]', instructions: '["fry"]', servings: null, sourceUrl: null, createdAt: 't' },
]

test('search matches on title', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: { q: 'chicken' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.strictEqual(res.body.recipes[0].id, 1)
})

test('search matches on ingredients', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: { q: 'broccoli' } }, res)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.strictEqual(res.body.recipes[0].id, 2)
})

test('empty query returns all of the user\'s recipes', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: {} }, res)
  assert.strictEqual(res.body.recipes.length, 2)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: FAIL — `makeSearchHandler` is not a function / not exported.

- [ ] **Step 3: Implement the handler**

In `backend/recipes/savedRecipeHandlers.js`, add the Fuse require at the top:
```javascript
const Fuse = require('fuse.js')
```

Add the handler before the `module.exports`:
```javascript
function makeSearchHandler(prisma) {
  return async function search(req, res) {
    const q = (req.query && req.query.q ? String(req.query.q) : '').trim()
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    const recipes = rows.map(deserializeRecipe)
    if (!q) return res.status(200).json({ recipes })
    const fuse = new Fuse(recipes, {
      keys: ['title', 'ingredients'],
      threshold: 0.4,
      ignoreLocation: true,
    })
    return res.status(200).json({ recipes: fuse.search(q).map((r) => r.item) })
  }
}
```

Add `makeSearchHandler` to `module.exports`:
```javascript
module.exports = {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler,
}
```

- [ ] **Step 4: Register the route**

In `backend/recipes/savedRecipeRoutes.js`, import the handler and register `GET /search` (before `/:id` routes):
```javascript
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.get('/search', makeSearchHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.put('/:id', makeUpdateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: PASS (existing handler tests + new search tests).

- [ ] **Step 6: Commit**

```bash
git add backend/recipes/savedRecipeHandlers.js backend/recipes/savedRecipeRoutes.js backend/recipes/__tests__/savedRecipeHandlers.test.js
git commit -m "feat: add saved-recipe search endpoint"
```

---

## Task 5: Frontend API helpers

**Files:**
- Modify: `frontend/src/api/foods.js`
- Modify: `frontend/src/api/savedRecipes.js`

- [ ] **Step 1: Add `source` to `searchFoods`**

Replace `frontend/src/api/foods.js` with:
```javascript
import { apiGet } from './client.js'

export const searchFoods = (q, source) =>
  apiGet(`/search-foods?q=${encodeURIComponent(q)}${source ? `&source=${source}` : ''}`)
```

- [ ] **Step 2: Add `searchSavedRecipes`**

In `frontend/src/api/savedRecipes.js`, add:
```javascript
export const searchSavedRecipes = (q) =>
  apiGet(`/saved-recipes/search?q=${encodeURIComponent(q)}`)
```

(Keep the existing imports; `apiGet` is already imported.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/foods.js frontend/src/api/savedRecipes.js
git commit -m "feat: API helpers for web food search and saved-recipe search"
```

---

## Task 6: Editor rows show match, web search, and needs-amount badge

**Files:**
- Modify: `frontend/src/components/IngredientsEditor.jsx`
- Modify: `frontend/src/components/IngredientsEditor.css`
- Test: `frontend/src/components/__tests__/IngredientsEditor.test.jsx`

This task uses the `ui-ux-pro-max` skill for the visual styling of the match line, badge, and web-search button (mobile-first). Invoke it before writing the CSS in Step 5.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/components/__tests__/IngredientsEditor.test.jsx`. First extend the existing `searchFoods` mock so it can distinguish sources, and update `makeEditor`/render calls to pass `nutritionItems`:

```javascript
// Replace the existing vi.mock for foods.js with:
vi.mock('../../api/foods.js', () => ({
  searchFoods: vi.fn((q, source) => Promise.resolve({
    foods: source === 'web'
      ? [{ food_name: 'Egg (web)', food_description: 'Per 1 large - Calories: 72kcal' }]
      : [{ food_name: 'Egg, whole', food_description: 'Per 100g - Calories: 143kcal' }],
  })),
}))

const nutritionItems = [
  { name: '2 eggs', matched: true, matchedName: 'Egg, whole', grams: 100, needsAmount: false },
  { name: 'salt', matched: false, needsAmount: false },
]

it('shows what each line matched to', () => {
  render(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} nutritionItems={nutritionItems} onClose={vi.fn()} />)
  expect(screen.getByText(/matched to/i)).toBeInTheDocument()
  expect(screen.getByText(/Egg, whole/)).toBeInTheDocument()
})

it('shows a needs-amount badge and opens the amount panel', () => {
  const items = [{ id: 'a', text: '1 chicken breast', nutrition: null }]
  const ni = [{ name: '1 chicken breast', matched: true, matchedName: 'Chicken breast', grams: null, needsAmount: true }]
  const editor = makeEditor(items)
  render(<IngredientsEditor editor={editor} items={items} nutritionItems={ni} onClose={vi.fn()} />)
  const badge = screen.getByRole('button', { name: /needs amount/i })
  fireEvent.click(badge)
  expect(screen.getByLabelText('Quantity')).toBeInTheDocument()
})

it('Search the web queries FatSecret and lists results', async () => {
  const editor = makeEditor(ingredients)
  render(<IngredientsEditor editor={editor} items={ingredients} nutritionItems={nutritionItems} onClose={vi.fn()} />)
  fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
  fireEvent.click(screen.getByRole('button', { name: /search the web/i }))
  await waitFor(() => expect(screen.getByText(/Egg \(web\)/)).toBeInTheDocument())
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test:run -- src/components/__tests__/IngredientsEditor.test.jsx`
Expected: FAIL — no match line text, no "needs amount" button, no "search the web" button.

- [ ] **Step 3: Update `ReplacePanel` for current-match + web search**

In `frontend/src/components/IngredientsEditor.jsx`, replace `ReplacePanel` with:
```javascript
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
```

- [ ] **Step 4: Add the match line + badge to `Row`, and pass `nutritionItems` per row**

Replace `Row` and the list-render in `IngredientsEditor` with:
```javascript
function MatchLine({ result, onNeedAmount }) {
  if (!result) return null
  return (
    <div className="ing-row__match">
      {result.matched
        ? <span>matched to “{result.matchedName}”{result.grams != null ? ` · ${result.grams} g` : ''}</span>
        : <span className="ing-row__nomatch">no match</span>}
      {result.needsAmount && (
        <button className="ing-badge ing-badge--warn" onClick={onNeedAmount} aria-label="Needs amount">⚠ Needs amount</button>
      )}
    </div>
  )
}

function Row({ item, result, editor }) {
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
      <div className="ing-row__summary">{nutritionSummary(item.nutrition)}</div>
      {!item.nutrition && <MatchLine result={result} onNeedAmount={() => setPanel('amount')} />}
      <div className="ing-row__actions">
        <button className="ing-btn" aria-label="Replace" onClick={() => setPanel(panel === 'replace' ? null : 'replace')}>Replace</button>
        <button className="ing-btn" aria-label="Amount" onClick={() => setPanel(panel === 'amount' ? null : 'amount')}>Amount</button>
        <button className="ing-btn" aria-label="Manual" onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>Manual</button>
        <button className="ing-btn" aria-label="Exclude" onClick={() => editor.exclude(item.id)}>Exclude</button>
        <button className="ing-btn" aria-label="Reset nutrition" onClick={() => editor.clearNutrition(item.id)}>Reset</button>
      </div>
      {panel === 'replace' && <ReplacePanel initial={item.text} current={result && result.matched ? result.matchedName : null} onPick={(f) => { editor.setFood(item.id, f); setPanel(null) }} />}
      {panel === 'amount' && <AmountPanel onApply={(qd, u) => { editor.setAmount(item.id, qd, u); setPanel(null) }} />}
      {panel === 'manual' && <ManualPanel onApply={(m) => { editor.setManual(item.id, m); setPanel(null) }} />}
    </li>
  )
}
```

Update the `IngredientsEditor` signature and list render to thread `nutritionItems` (default `[]`) to each row by index:
```javascript
export function IngredientsEditor({ editor, items, nutritionItems = [], onClose }) {
```
and the list:
```javascript
          <ul className="ing-editor__list">
            {items.map((item, i) => <Row key={item.id} item={item} result={nutritionItems[i]} editor={editor} />)}
          </ul>
```

> Note: rows match `nutritionItems` by position. Reordering/adding rows during an edit session may misalign the match line until nutrition recomputes (on close/reopen of the editor). This is acceptable for v1 and documented in the spec.

- [ ] **Step 5: Add styles**

Invoke the `ui-ux-pro-max` skill for mobile-first styling, then add to `frontend/src/components/IngredientsEditor.css`:
```css
.ing-row__match {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.8rem;
  color: var(--color-text-muted, #666);
  margin: 0.15rem 0 0.35rem;
}
.ing-row__nomatch { font-style: italic; }
.ing-badge--warn {
  border: none;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.75rem;
  background: #fde68a;
  color: #7c2d12;
  cursor: pointer;
}
.ing-current {
  font-size: 0.8rem;
  color: var(--color-text-muted, #666);
  margin: 0 0 0.4rem;
}
.ing-btn--web {
  width: 100%;
  margin: 0.25rem 0 0.5rem;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm run test:run -- src/components/__tests__/IngredientsEditor.test.jsx`
Expected: PASS (existing editor tests + 3 new tests).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/IngredientsEditor.jsx frontend/src/components/IngredientsEditor.css frontend/src/components/__tests__/IngredientsEditor.test.jsx
git commit -m "feat: editor shows matches, web search, and needs-amount badge"
```

---

## Task 7: Saved-page search box

**Files:**
- Modify: `frontend/src/pages/SavedPage.jsx`
- Modify: `frontend/src/pages/SavedPage.css`
- Test: `frontend/src/pages/__tests__/SavedPage.test.jsx` (new)

This task uses the `ui-ux-pro-max` skill for the search-box styling (mobile-first). Invoke it before Step 5.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/__tests__/SavedPage.test.jsx`:
```javascript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SavedPage } from '../SavedPage.jsx'

vi.mock('../../hooks/useSavedRecipes.js', () => ({
  useSavedRecipes: () => ({
    list: [
      { id: 1, title: 'Chicken Soup', image: null, ingredients: ['chicken'], instructions: [] },
      { id: 2, title: 'Veggie Stir Fry', image: null, ingredients: ['broccoli'], instructions: [] },
    ],
  }),
}))

vi.mock('../../context/RecipeContext.jsx', () => ({
  useRecipe: () => ({ setRecipe: vi.fn() }),
}))

vi.mock('../../api/savedRecipes.js', () => ({
  searchSavedRecipes: vi.fn().mockResolvedValue({
    recipes: [{ id: 2, title: 'Veggie Stir Fry', image: null, ingredients: ['broccoli'], instructions: [] }],
  }),
}))

describe('SavedPage search', () => {
  it('lists all saved recipes initially', () => {
    render(<MemoryRouter><SavedPage /></MemoryRouter>)
    expect(screen.getByText('Chicken Soup')).toBeInTheDocument()
    expect(screen.getByText('Veggie Stir Fry')).toBeInTheDocument()
  })

  it('typing a query shows server search results', async () => {
    render(<MemoryRouter><SavedPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('searchbox', { name: /search saved recipes/i }), { target: { value: 'veggie' } })
    await waitFor(() => expect(screen.queryByText('Chicken Soup')).not.toBeInTheDocument())
    expect(screen.getByText('Veggie Stir Fry')).toBeInTheDocument()
  })
})
```

> Confirm `SearchResultItem` renders `recipe.title` as visible text (it does — it's the list item used on the Search/Saved pages). If it renders the title in an element queryable by `getByText`, these assertions hold.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test:run -- src/pages/__tests__/SavedPage.test.jsx`
Expected: FAIL — no `searchbox` role element exists.

- [ ] **Step 3: Implement the search box in `SavedPage`**

Replace `frontend/src/pages/SavedPage.jsx` with:
```javascript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { searchSavedRecipes } from '../api/savedRecipes.js'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import './SavedPage.css'

export function SavedPage() {
  const { list: favorites } = useSavedRecipes()
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)

  useEffect(() => {
    const term = query.trim()
    if (!term) { setResults(null); return }
    const t = setTimeout(() => {
      searchSavedRecipes(term)
        .then(({ recipes }) => setResults(recipes))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const shown = results ?? favorites

  const handleSelect = (recipe) => {
    setRecipe(recipe)
    navigate('/recipe')
  }

  return (
    <div className="saved-page">
      <header className="page-header">
        <h1 className="page-title">Saved Recipes</h1>
      </header>
      <div className="saved-search">
        <input
          type="search"
          className="saved-search__input"
          placeholder="Search saved recipes…"
          aria-label="Search saved recipes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <main className="saved-main">
        {shown.length === 0 ? (
          <div className="saved-empty">
            <svg className="saved-empty__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
            <p className="saved-empty__text">{results !== null ? 'No matching recipes.' : 'No saved recipes yet.'}</p>
            {results === null && (
              <p className="saved-empty__hint">Tap the heart on any recipe to save it here.</p>
            )}
          </div>
        ) : (
          <ul className="saved-list">
            {shown.map(recipe => (
              <li key={recipe.id}>
                <SearchResultItem recipe={recipe} onClick={() => handleSelect(recipe)} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test:run -- src/pages/__tests__/SavedPage.test.jsx`
Expected: PASS.

- [ ] **Step 5: Add styles**

Invoke `ui-ux-pro-max`, then add to `frontend/src/pages/SavedPage.css`:
```css
.saved-search {
  padding: 0 1rem 0.5rem;
}
.saved-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.9rem;
  font-size: 1rem;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 0.75rem;
  background: var(--color-surface, #fff);
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/SavedPage.jsx frontend/src/pages/SavedPage.css frontend/src/pages/__tests__/SavedPage.test.jsx
git commit -m "feat: search saved recipes from the Saved page"
```

---

## Task 8: Full-suite verification

- [ ] **Step 1: Run the entire backend suite**

Run: `cd backend && npm test`
Expected: PASS (no regressions).

- [ ] **Step 2: Run the entire frontend suite**

Run: `cd frontend && npm run test:run`
Expected: PASS (no regressions).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Start backend (`cd backend && node server.js`) and frontend (`cd frontend && npm run dev`). Verify: editor rows show "matched to…"; "Search the web" returns FatSecret results; a line like "1 chicken breast" shows "⚠ Needs amount" and opens the amount panel; the Saved page search box filters recipes.

---

## Self-Review notes

- **Spec coverage:** Slice 1 → Task 6 (MatchLine). Slice 2 → Task 6 (ReplacePanel `current`). Slice 3 → Tasks 2,3,5,6. Slice 4 → Tasks 1,6. Slice 5 → Tasks 4,5,7. Cross-cutting (mobile-first/ui-ux) → Tasks 6,7 steps. Testing → each task + Task 8.
- **Type consistency:** `searchFoods(q, source)` (Task 5) matches usage in Task 6; `needsAmount` field name consistent across Tasks 1 and 6; `makeSearchHandler` consistent across Tasks 4. `nutritionItems` prop already exists on `IngredientsEditor` (passed from `RecipeDetailPage`); Task 6 only consumes it.
- **No server route test harness exists** in this repo, so Task 3 (`source` param) is verified manually; the underlying FatSecret function is unit-tested in Task 2.
