# Nutrition Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a combined FDA-style nutrition label on the recipe's Nutrition card, built from each ingredient's macros (FatSecret), scaled by amount and summed.

**Architecture:** Backend-centric. The backend parses each ingredient, converts amounts to grams, queries FatSecret (OAuth 1.0 signed), parses the macro string, scales and sums into a totals contract. The frontend passes `ingredients` + `servings` and renders the label. See spec: `docs/superpowers/specs/2026-05-31-nutrition-card-design.md`.

**Tech Stack:** Node/Express backend (`node --test`), `oauth-1.0a` + built-in `crypto` for HMAC-SHA1 signing, React 19 + Vite frontend (Vitest + Testing Library).

---

## File Structure

**Backend — new module `backend/nutrition/`:**
- `parseIngredient.js` — raw line → `{ quantity, unit, name }` (numeric quantity).
- `units.js` — `toGrams(quantity, unit)` → grams | null.
- `parseFoodDescription.js` — FatSecret `food_description` → `{ basis, calories, fat, carbs, protein }`.
- `fatsecretClient.js` — `searchFood(name)` (OAuth 1.0 signed) + pure `pickFood(data)`.
- `combine.js` — `combineNutrition(ingredients, servings, { searchFood })` → response contract; plus `parseServings`.
- `__tests__/*.test.js` — one per module.

**Backend — modified:**
- `server.js` — rewire `POST /get-nutrition`; remove old `fatSecretApi` + `api-keys.json`.
- `.gitignore`, `.env`, `.env.example`, `package.json` — deps/secrets handling.

**Frontend — modified:**
- `src/api/recipes.js` — `getNutrition(ingredients, servings)`.
- `src/components/cards/NutritionCard.jsx` — render the label from the new contract.
- `src/components/cards/NutritionCard.css` — label styling.
- `src/api/__tests__/recipes.test.js`, `src/components/cards/__tests__/NutritionCard.test.jsx` — tests.

**Response contract (backend → frontend):**
```json
{
  "servings": 4,
  "totals":     { "calories": 1840, "fat": 92.5, "carbs": 130.2, "protein": 110.7 },
  "perServing": { "calories": 460,  "fat": 23.1, "carbs": 32.6,  "protein": 27.7 },
  "items": [ { "name": "flour", "matched": true, "grams": 480, "calories": 1748, "fat": 4.7, "carbs": 366, "protein": 49.6 } ],
  "estimated": true
}
```

---

## Task 1: Backend setup — dependency, secrets, module folder

**Files:**
- Modify: `backend/package.json` (add `oauth-1.0a`)
- Modify: `backend/.gitignore`
- Create: `backend/.env.example`
- Modify: `backend/.env` (local secrets — not committed)
- Create: `backend/nutrition/` (folder, via first file)

- [ ] **Step 1: Install the OAuth 1.0 signing library**

From `backend/`:
```bash
npm install oauth-1.0a
```
Expected: `oauth-1.0a` appears in `backend/package.json` dependencies. (`crypto` is built into Node — no install.)

- [ ] **Step 2: Stop tracking `.env` and ignore it**

Edit `backend/.gitignore` to:
```
api-keys.json
.env
```
Then untrack the currently-committed empty `.env` (keeps the local file):
```bash
git rm --cached backend/.env
```
Expected: `.env` shows as deleted-from-index + untracked; the file still exists on disk.

- [ ] **Step 3: Create `backend/.env.example` (committed documentation)**

Create `backend/.env.example`:
```
# FatSecret REST API — OAuth 1.0 consumer credentials
# Create at https://platform.fatsecret.com/ (no IP allow-listing needed for OAuth 1.0)
FATSECRET_CONSUMER_KEY=your_consumer_key_here
FATSECRET_CONSUMER_SECRET=your_consumer_secret_here
```

- [ ] **Step 4: Put real credentials in `backend/.env` (local only)**

Append to `backend/.env` (replace with real values from the FatSecret dashboard):
```
FATSECRET_CONSUMER_KEY=...
FATSECRET_CONSUMER_SECRET=...
```
Note: `server.js` already calls `require("dotenv").config()`, so these load automatically.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.gitignore backend/.env.example
git commit -m "chore: add oauth-1.0a dep and FatSecret env scaffolding"
```

---

## Task 2: `units.js` — convert amounts to grams

**Files:**
- Create: `backend/nutrition/units.js`
- Test: `backend/nutrition/__tests__/units.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/units.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { toGrams } = require('../units')

test('toGrams: weights are exact', () => {
  assert.strictEqual(toGrams(100, 'g'), 100)
  assert.strictEqual(toGrams(1, 'kg'), 1000)
  assert.strictEqual(Math.round(toGrams(1, 'oz')), 28)
  assert.strictEqual(Math.round(toGrams(1, 'lb')), 454)
})

test('toGrams: volumes are approximate (~1 g/ml)', () => {
  assert.strictEqual(Math.round(toGrams(1, 'cup')), 237)
  assert.strictEqual(Math.round(toGrams(1, 'tbsp')), 15)
  assert.strictEqual(Math.round(toGrams(1, 'tsp')), 5)
})

test('toGrams: plural and uppercase units resolve', () => {
  assert.strictEqual(toGrams(2, 'Cups'), toGrams(2, 'cup'))
  assert.strictEqual(toGrams(2, 'grams'), 2)
})

test('toGrams: counts/ambiguous units return null', () => {
  assert.strictEqual(toGrams(2, 'clove'), null)
  assert.strictEqual(toGrams(1, 'can'), null)
})

test('toGrams: missing quantity or unit returns null', () => {
  assert.strictEqual(toGrams(null, 'g'), null)
  assert.strictEqual(toGrams(2, null), null)
  assert.strictEqual(toGrams(2, 'sprinkle'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test nutrition/__tests__/units.test.js
```
Expected: FAIL — `Cannot find module '../units'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/nutrition/units.js`:
```js
// Grams per unit. Volumes assume ~1 g/ml (water-like) — intentionally approximate.
const GRAMS = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  tsp: 4.92892, tsps: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  tbsp: 14.7868, tbsps: 14.7868, tbl: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  cup: 236.588, cups: 236.588,
  pint: 473.176, pints: 473.176,
  quart: 946.353, quarts: 946.353,
  gallon: 3785.41, gallons: 3785.41,
}

function toGrams(quantity, unit) {
  if (quantity == null || !Number.isFinite(quantity)) return null
  if (!unit) return null
  const key = String(unit).toLowerCase().replace(/\.$/, '')
  const g = GRAMS[key]
  return g == null ? null : quantity * g
}

module.exports = { toGrams, GRAMS }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/units.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/units.js backend/nutrition/__tests__/units.test.js
git commit -m "feat: add unit-to-grams conversion for nutrition scaling"
```

---

## Task 3: `parseIngredient.js` — raw line → quantity/unit/name

**Files:**
- Create: `backend/nutrition/parseIngredient.js`
- Test: `backend/nutrition/__tests__/parseIngredient.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/parseIngredient.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { parseIngredient } = require('../parseIngredient')

test('splits quantity, unit, and name', () => {
  assert.deepStrictEqual(parseIngredient('2 cups flour'),
    { quantity: 2, unit: 'cup', name: 'flour' })
})

test('evaluates a simple fraction', () => {
  const r = parseIngredient('1/2 tsp Italian seasoning')
  assert.strictEqual(r.quantity, 0.5)
  assert.strictEqual(r.unit, 'tsp')
  assert.strictEqual(r.name, 'Italian seasoning')
})

test('evaluates a mixed number', () => {
  assert.strictEqual(parseIngredient('1 1/2 cups sugar').quantity, 1.5)
})

test('averages a range', () => {
  assert.strictEqual(parseIngredient('2-3 cloves garlic').quantity, 2.5)
})

test('handles a count with no unit', () => {
  assert.deepStrictEqual(parseIngredient('3 eggs'),
    { quantity: 3, unit: null, name: 'eggs' })
})

test('drops parentheticals and post-comma prep notes', () => {
  const r = parseIngredient('1 cup flour (sifted), packed')
  assert.strictEqual(r.name, 'flour')
})

test('handles an amount-less line', () => {
  assert.deepStrictEqual(parseIngredient('Salt and pepper to taste'),
    { quantity: null, unit: null, name: 'Salt and pepper to taste' })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test nutrition/__tests__/parseIngredient.test.js
```
Expected: FAIL — `Cannot find module '../parseIngredient'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/nutrition/parseIngredient.js`:
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
const UNITS = new Set(UNIT_WORDS)
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/

function evalQuantity(text) {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = text.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const range = text.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/)
  if (range) return (Number(range[1]) + Number(range[2])) / 2
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

function parseIngredient(raw) {
  const original = String(raw == null ? '' : raw).trim()
  let work = original
  while (/\([^()]*\)/.test(work)) work = work.replace(/\([^()]*\)/g, ' ')
  const comma = work.indexOf(',')
  if (comma !== -1) work = work.slice(0, comma)
  work = work.replace(/\s+/g, ' ').trim()

  let quantity = null
  let unit = null
  let rest = work
  const qty = work.match(QTY_RE)
  if (qty) {
    quantity = evalQuantity(qty[1].replace(/\s+/g, ' ').trim())
    rest = work.slice(qty[0].length)
    const tokens = rest.split(' ').filter(Boolean)
    if (tokens.length && UNITS.has(tokens[0].toLowerCase().replace(/\.$/, ''))) {
      unit = tokens.shift().toLowerCase().replace(/\.$/, '')
      rest = tokens.join(' ')
    }
  }
  const name = rest.trim() || original
  return { quantity, unit, name }
}

module.exports = { parseIngredient }
```
Note: `unit` is normalized to lowercase singular/plural token (e.g. `'cup'`, `'cups'`); `units.js` accepts both forms.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/parseIngredient.test.js
```
Expected: PASS (7 tests). The `'2 cups flour'` test expects `unit: 'cup'` — confirm the QTY split keeps the singular token; if your input pluralizes, both forms convert identically in `units.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/parseIngredient.js backend/nutrition/__tests__/parseIngredient.test.js
git commit -m "feat: add backend ingredient parser with numeric quantities"
```

---

## Task 4: `parseFoodDescription.js` — FatSecret macro string → numbers

**Files:**
- Create: `backend/nutrition/parseFoodDescription.js`
- Test: `backend/nutrition/__tests__/parseFoodDescription.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/parseFoodDescription.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { parseFoodDescription } = require('../parseFoodDescription')

test('parses a Per 100g description', () => {
  const r = parseFoodDescription('Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g')
  assert.deepStrictEqual(r.basis, { type: 'mass', grams: 100 })
  assert.strictEqual(r.calories, 52)
  assert.strictEqual(r.fat, 0.17)
  assert.strictEqual(r.carbs, 13.81)
  assert.strictEqual(r.protein, 0.26)
})

test('parses a Per 1 cup description', () => {
  const r = parseFoodDescription('Per 1 cup - Calories: 200kcal | Fat: 8g | Carbs: 25g | Protein: 6g')
  assert.deepStrictEqual(r.basis, { type: 'unit', count: 1, unit: 'cup' })
  assert.strictEqual(r.calories, 200)
})

test('falls back to serving basis when unrecognised', () => {
  const r = parseFoodDescription('Per serving - Calories: 90kcal | Fat: 1g | Carbs: 20g | Protein: 2g')
  assert.deepStrictEqual(r.basis, { type: 'serving' })
})

test('returns null on malformed input', () => {
  assert.strictEqual(parseFoodDescription('not a description'), null)
  assert.strictEqual(parseFoodDescription(''), null)
  assert.strictEqual(parseFoodDescription(null), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test nutrition/__tests__/parseFoodDescription.test.js
```
Expected: FAIL — `Cannot find module '../parseFoodDescription'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/nutrition/parseFoodDescription.js`:
```js
function parseFoodDescription(desc) {
  if (!desc || typeof desc !== 'string') return null
  const dash = desc.indexOf(' - ')
  if (dash === -1) return null

  const basisText = desc.slice(0, dash).replace(/^Per\s+/i, '').trim()
  const macroText = desc.slice(dash + 3)

  const get = (label) => {
    const m = macroText.match(new RegExp(label + '\\s*:\\s*([0-9.]+)', 'i'))
    return m ? Number(m[1]) : null
  }
  const calories = get('Calories')
  if (calories == null) return null
  const fat = get('Fat')
  const carbs = get('Carbs')
  const protein = get('Protein')

  let basis
  const massM = basisText.match(/^([\d.]+)\s*g(?:ram)?s?$/i)
  if (massM) {
    basis = { type: 'mass', grams: Number(massM[1]) }
  } else {
    const unitM = basisText.match(/^([\d.]+)\s+(.+)$/)
    basis = unitM
      ? { type: 'unit', count: Number(unitM[1]), unit: unitM[2].toLowerCase().trim() }
      : { type: 'serving' }
  }
  return { basis, calories, fat, carbs, protein }
}

module.exports = { parseFoodDescription }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/parseFoodDescription.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/parseFoodDescription.js backend/nutrition/__tests__/parseFoodDescription.test.js
git commit -m "feat: parse FatSecret food_description into macro numbers"
```

---

## Task 5: `fatsecretClient.js` — OAuth 1.0 signed search

**Files:**
- Create: `backend/nutrition/fatsecretClient.js`
- Test: `backend/nutrition/__tests__/fatsecretClient.test.js`

The network/signing wrapper is thin; the testable logic is `pickFood`, which normalises FatSecret's single-object-vs-array response.

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/fatsecretClient.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { pickFood } = require('../fatsecretClient')

test('pickFood returns the first food from an array', () => {
  const data = { foods: { food: [{ food_name: 'A' }, { food_name: 'B' }] } }
  assert.deepStrictEqual(pickFood(data), { food_name: 'A' })
})

test('pickFood returns a single food object as-is', () => {
  const data = { foods: { food: { food_name: 'Solo' } } }
  assert.deepStrictEqual(pickFood(data), { food_name: 'Solo' })
})

test('pickFood returns null when there are no foods', () => {
  assert.strictEqual(pickFood({ foods: {} }), null)
  assert.strictEqual(pickFood({ foods: { food: [] } }), null)
  assert.strictEqual(pickFood({}), null)
  assert.strictEqual(pickFood(null), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test nutrition/__tests__/fatsecretClient.test.js
```
Expected: FAIL — `Cannot find module '../fatsecretClient'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/nutrition/fatsecretClient.js`:
```js
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')

const ENDPOINT = 'https://platform.fatsecret.com/rest/server.api'

function pickFood(data) {
  const food = data && data.foods && data.foods.food
  if (!food) return null
  if (Array.isArray(food)) return food.length ? food[0] : null
  return food
}

function makeOAuth() {
  return OAuth({
    consumer: {
      key: process.env.FATSECRET_CONSUMER_KEY,
      secret: process.env.FATSECRET_CONSUMER_SECRET,
    },
    signature_method: 'HMAC-SHA1',
    hash_function: (base, key) =>
      crypto.createHmac('sha1', key).update(base).digest('base64'),
  })
}

// 2-legged OAuth 1.0 (no token). Sign the request, then send method params
// and oauth_* params together as the GET query string.
async function searchFood(name) {
  const oauth = makeOAuth()
  const data = { method: 'foods.search', search_expression: name, format: 'json' }
  const oauthParams = oauth.authorize({ url: ENDPOINT, method: 'GET', data })
  const qs = new URLSearchParams({ ...data, ...oauthParams }).toString()

  const res = await fetch(`${ENDPOINT}?${qs}`, { method: 'GET' })
  if (!res.ok) throw new Error(`FatSecret HTTP ${res.status}`)
  const json = await res.json()
  if (json && json.error) throw new Error(`FatSecret error: ${json.error.message || 'unknown'}`)
  return pickFood(json)
}

module.exports = { searchFood, pickFood, ENDPOINT }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/fatsecretClient.test.js
```
Expected: PASS (3 tests). (`searchFood` makes a real network call and is exercised in the Task 7 smoke test, not in unit tests.)

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/fatsecretClient.js backend/nutrition/__tests__/fatsecretClient.test.js
git commit -m "feat: add OAuth 1.0 signed FatSecret foods.search client"
```

---

## Task 6: `combine.js` — scale and sum into the contract

**Files:**
- Create: `backend/nutrition/combine.js`
- Test: `backend/nutrition/__tests__/combine.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/combine.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { combineNutrition, parseServings } = require('../combine')

// Fake searchFood keyed by the parsed ingredient name.
const fake = (map) => async (name) => map[name] || null

test('parseServings extracts a positive number or null', () => {
  assert.strictEqual(parseServings('4'), 4)
  assert.strictEqual(parseServings('8 servings'), 8)
  assert.strictEqual(parseServings(null), null)
  assert.strictEqual(parseServings('0'), null)
  assert.strictEqual(parseServings('N/A'), null)
})

test('scales a mass basis by grams', async () => {
  const searchFood = fake({
    sugar: { food_name: 'Sugar', food_description: 'Per 100g - Calories: 400kcal | Fat: 0g | Carbs: 100g | Protein: 0g' },
  })
  const r = await combineNutrition(['200 g sugar'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 800) // 200g / 100g * 400
  assert.strictEqual(r.totals.carbs, 200)
  assert.strictEqual(r.items[0].matched, true)
  assert.strictEqual(r.perServing, null)
})

test('computes per-serving when servings is known', async () => {
  const searchFood = fake({
    rice: { food_name: 'Rice', food_description: 'Per 100g - Calories: 100kcal | Fat: 0g | Carbs: 20g | Protein: 2g' },
  })
  const r = await combineNutrition(['400 g rice'], '4', { searchFood })
  assert.strictEqual(r.totals.calories, 400)
  assert.strictEqual(r.servings, 4)
  assert.strictEqual(r.perServing.calories, 100)
})

test('unmatched ingredient contributes zero and is flagged', async () => {
  const r = await combineNutrition(['1 pinch unobtainium'], null, { searchFood: fake({}) })
  assert.strictEqual(r.items[0].matched, false)
  assert.strictEqual(r.totals.calories, 0)
  assert.strictEqual(r.estimated, true)
})

test('sums multiple ingredients', async () => {
  const searchFood = fake({
    flour: { food_name: 'Flour', food_description: 'Per 100g - Calories: 100kcal | Fat: 1g | Carbs: 20g | Protein: 3g' },
    butter: { food_name: 'Butter', food_description: 'Per 100g - Calories: 700kcal | Fat: 80g | Carbs: 0g | Protein: 1g' },
  })
  const r = await combineNutrition(['100 g flour', '100 g butter'], null, { searchFood })
  assert.strictEqual(r.totals.calories, 800)
  assert.strictEqual(r.totals.fat, 81)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test nutrition/__tests__/combine.test.js
```
Expected: FAIL — `Cannot find module '../combine'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/nutrition/combine.js`:
```js
const { parseIngredient } = require('./parseIngredient')
const { toGrams } = require('./units')
const { parseFoodDescription } = require('./parseFoodDescription')

function parseServings(servings) {
  if (servings == null) return null
  const m = String(servings).match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return n > 0 ? n : null
}

function round(n, dp) {
  const f = Math.pow(10, dp)
  return Math.round(n * f) / f
}

async function combineNutrition(ingredients, servings, { searchFood }) {
  const items = []
  const totals = { calories: 0, fat: 0, carbs: 0, protein: 0 }
  let estimated = false

  for (const line of ingredients || []) {
    const { quantity, unit, name } = parseIngredient(line)

    let match = null
    try { match = await searchFood(name) } catch { match = null }
    const desc = match && parseFoodDescription(match.food_description)

    if (!desc) {
      estimated = true
      items.push({ name, matched: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }

    const grams = toGrams(quantity, unit)
    let scale
    let approx = false
    if (grams != null && desc.basis.type === 'mass') {
      scale = grams / desc.basis.grams
    } else if (desc.basis.type === 'unit' && unit && unit === desc.basis.unit && quantity != null) {
      scale = quantity / desc.basis.count
    } else if (quantity != null) {
      scale = quantity
      approx = true
    } else {
      scale = 1
      approx = true
    }
    if (approx) estimated = true

    const item = {
      name,
      matched: true,
      grams: grams != null ? round(grams, 1) : null,
      calories: Math.round((desc.calories || 0) * scale),
      fat: round((desc.fat || 0) * scale, 1),
      carbs: round((desc.carbs || 0) * scale, 1),
      protein: round((desc.protein || 0) * scale, 1),
    }
    items.push(item)
    totals.calories += item.calories
    totals.fat += item.fat
    totals.carbs += item.carbs
    totals.protein += item.protein
  }

  totals.calories = Math.round(totals.calories)
  totals.fat = round(totals.fat, 1)
  totals.carbs = round(totals.carbs, 1)
  totals.protein = round(totals.protein, 1)

  const s = parseServings(servings)
  const perServing = s ? {
    calories: Math.round(totals.calories / s),
    fat: round(totals.fat / s, 1),
    carbs: round(totals.carbs / s, 1),
    protein: round(totals.protein / s, 1),
  } : null

  return { servings: s, totals, perServing, items, estimated }
}

module.exports = { combineNutrition, parseServings }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/combine.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Run the whole backend suite (no regressions)**

```bash
npm test
```
Expected: all nutrition tests + existing scraper tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/nutrition/combine.js backend/nutrition/__tests__/combine.test.js
git commit -m "feat: combine and scale ingredient nutrition into totals"
```

---

## Task 7: Rewire `POST /get-nutrition` in `server.js`

**Files:**
- Modify: `backend/server.js` (replace the `/get-nutrition` handler at lines 149-195; remove `fatSecretApi` and the `api-keys.json` require)

- [ ] **Step 1: Replace the endpoint and delete the old FatSecret code**

In `backend/server.js`, add near the other requires (top of file):
```js
const { combineNutrition } = require("./nutrition/combine");
const { searchFood } = require("./nutrition/fatsecretClient");
```

Replace the entire existing `app.post('/get-nutrition', ...)` handler **and** the `const fatSecretApi = async (ingredient) => { ... }` function (current lines ~149-195) with:
```js
app.post('/get-nutrition', async (req, res) => {
  const { ingredients, servings } = req.body;
  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: "ingredients array is required" });
  }
  try {
    const result = await combineNutrition(ingredients, servings, { searchFood });
    return res.status(200).json(result);
  } catch (err) {
    console.error("Nutrition combine failed:", err);
    return res.status(500).json({ error: "Failed to fetch nutrition info" });
  }
});
```
Confirm no remaining references to `fatSecretApi` or `api-keys.json` exist in `server.js`.

- [ ] **Step 2: Start the server**

From `backend/` (ensure real credentials are in `.env` from Task 1, Step 4):
```bash
node server.js
```
Expected: `Server running at http://localhost:7000`.

- [ ] **Step 3: Smoke-test the endpoint (real FatSecret call)**

In a second terminal:
```bash
curl -s -X POST http://localhost:7000/get-nutrition -H "Content-Type: application/json" -d "{\"ingredients\":[\"200 g sugar\",\"3 eggs\"],\"servings\":\"4\"}"
```
Expected: JSON with non-zero `totals.calories`, a `perServing` object, an `items` array (one entry per ingredient with `matched` booleans), and `estimated: true`. If you get `Failed to fetch nutrition info`, check the server log — most likely missing/invalid `FATSECRET_CONSUMER_KEY`/`SECRET`.

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat: serve combined nutrition totals from /get-nutrition"
```

---

## Task 8: Frontend — `getNutrition` forwards `servings`

**Files:**
- Modify: `frontend/src/api/recipes.js:9-10`
- Test: `frontend/src/api/__tests__/recipes.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/api/__tests__/recipes.test.js` (inside the file, after the `saveRecipe` describe block):
```js
describe('getNutrition', () => {
  it('calls /get-nutrition with ingredients and servings', async () => {
    client.apiClient.mockResolvedValue({ totals: {} })
    const { getNutrition } = await import('../recipes.js')
    await getNutrition(['2 cups flour'], '4')
    expect(client.apiClient).toHaveBeenCalledWith('/get-nutrition', { ingredients: ['2 cups flour'], servings: '4' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/api/__tests__/recipes.test.js
```
Expected: FAIL — `getNutrition` called with `{ ingredients }` only (no `servings`).

- [ ] **Step 3: Update the implementation**

In `frontend/src/api/recipes.js`, change `getNutrition`:
```js
export const getNutrition = (ingredients, servings) =>
  apiClient('/get-nutrition', { ingredients, servings })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/__tests__/recipes.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/recipes.js frontend/src/api/__tests__/recipes.test.js
git commit -m "feat: forward servings to the nutrition endpoint"
```

---

## Task 9: Frontend — render the nutrition label

**Files:**
- Modify: `frontend/src/components/cards/NutritionCard.jsx` (full rewrite)
- Test: `frontend/src/components/cards/__tests__/NutritionCard.test.jsx` (full rewrite)

- [ ] **Step 1: Rewrite the test for the new contract**

Replace the entire contents of `frontend/src/components/cards/__tests__/NutritionCard.test.jsx`:
```jsx
import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'

vi.mock('../../../api/recipes.js', () => ({ getNutrition: vi.fn() }))
import { getNutrition } from '../../../api/recipes.js'

const recipe = { ingredients: ['2 cups flour', '3 eggs'], servings: '4' }

const payload = {
  servings: 4,
  totals: { calories: 1840, fat: 92.5, carbs: 130.2, protein: 110.7 },
  perServing: { calories: 460, fat: 23.1, carbs: 32.6, protein: 27.7 },
  items: [
    { name: 'flour', matched: true, grams: 480, calories: 1748, fat: 4.7, carbs: 366, protein: 49.6 },
    { name: 'eggs', matched: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 },
  ],
  estimated: true,
}

it('shows spinner while loading', () => {
  getNutrition.mockReturnValue(new Promise(() => {}))
  render(<NutritionCard recipe={recipe} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('renders the per-serving calories and macros on success', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText('460')).toBeInTheDocument())
  expect(screen.getByText('Total Fat')).toBeInTheDocument()
  expect(screen.getByText('23.1g')).toBeInTheDocument()
})

it('shows how many ingredients were matched', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText(/1\/2 ingredients matched/)).toBeInTheDocument())
})

it('passes servings to getNutrition', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(getNutrition).toHaveBeenCalledWith(['2 cups flour', '3 eggs'], '4'))
})

it('shows unavailable message on error', async () => {
  getNutrition.mockRejectedValue(new Error('Network error'))
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(screen.getByText('Nutrition data unavailable.')).toBeInTheDocument())
})

it('shows empty message when there are no ingredients', () => {
  render(<NutritionCard recipe={{ ingredients: [], servings: null }} />)
  expect(screen.getByText('No nutrition data found.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/components/cards/__tests__/NutritionCard.test.jsx
```
Expected: FAIL — old card renders `nutrition-list` items, not `460` / `Total Fat`.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `frontend/src/components/cards/NutritionCard.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { getNutrition } from '../../api/recipes.js'
import { Spinner } from '../ui/Spinner.jsx'
import './NutritionCard.css'

const MACROS = [
  { key: 'fat', label: 'Total Fat' },
  { key: 'carbs', label: 'Total Carbohydrate' },
  { key: 'protein', label: 'Protein' },
]

export function NutritionCard({ recipe }) {
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
    getNutrition(recipe.ingredients, recipe.servings)
      .then((d) => { if (alive) { setData(d); setLoading(false) } })
      .catch(() => { if (alive) { setError(true); setLoading(false) } })
    return () => { alive = false }
  }, [recipe.ingredients, recipe.servings])

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
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/cards/__tests__/NutritionCard.test.jsx
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/cards/NutritionCard.jsx frontend/src/components/cards/__tests__/NutritionCard.test.jsx
git commit -m "feat: render combined nutrition label on the card"
```

---

## Task 10: Frontend — nutrition label styling

**Files:**
- Modify: `frontend/src/components/cards/NutritionCard.css` (replace contents)

- [ ] **Step 1: Replace the CSS**

Replace the entire contents of `frontend/src/components/cards/NutritionCard.css`:
```css
.nutrition-card {
  background: var(--surface);
  min-height: 100%;
}

.nutrition-label {
  padding: 0 20px 24px;
}

.nutrition-label__basis {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  padding: 4px 0 8px;
}

.nutrition-label__calories {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-top: 6px solid var(--text-primary);
  border-bottom: 1px solid var(--border);
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
}

.nutrition-label__calories-value {
  font-feature-settings: 'tnum';
}

.nutrition-label__macros {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nutrition-label__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
}

.nutrition-label__name {
  font-weight: 600;
  color: var(--text-primary);
}

.nutrition-label__value {
  color: var(--text-primary);
  font-feature-settings: 'tnum';
}

.nutrition-label__whole {
  padding: 12px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  font-feature-settings: 'tnum';
}

.nutrition-label__note {
  padding: 8px 0 0;
  font-size: 12px;
  font-style: italic;
  color: var(--text-secondary);
}
```

- [ ] **Step 2: Verify the test suite still passes**

From `frontend/`:
```bash
npx vitest run src/components/cards/__tests__/NutritionCard.test.jsx
```
Expected: PASS (CSS does not affect assertions).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/cards/NutritionCard.css
git commit -m "style: FDA-style nutrition label layout"
```

---

## Task 11: Full-stack verification

**Files:** none (manual verification)

- [ ] **Step 1: Run the full test suites**

From `backend/`:
```bash
npm test
```
Expected: all backend tests PASS.

From `frontend/`:
```bash
npm run test:run
```
Expected: all frontend tests PASS.

- [ ] **Step 2: Run the app end-to-end**

- Start backend from `backend/`: `node server.js` (with real `.env` credentials).
- Start frontend from `frontend/`: set `VITE_API_URL=http://localhost:7000` (so the app hits local backend instead of the Render URL), then `npm run dev`.
- In the app: scrape a recipe (e.g. a Budget Bytes URL), open it, and swipe to the **Nutrition** card.

- [ ] **Step 3: Confirm the label**

Expected on the Nutrition card:
- A large **Calories** value (per serving when the recipe has servings).
- Total Fat / Total Carbohydrate / Protein rows in grams.
- A "Whole recipe: … " summary line when per-serving is shown.
- An "Estimated · X/Y ingredients matched" footnote.
- Loading spinner first, and "Nutrition data unavailable." if the backend/credentials fail.

- [ ] **Step 4: Final review**

Use superpowers:requesting-code-review to verify the work meets the spec before merging, then superpowers:finishing-a-development-branch to integrate.

---

## Self-Review notes

- **Spec coverage:** OAuth 1.0 auth (Tasks 1, 5), quantity-aware scaling (Tasks 2, 3, 6), big-4 nutrients (Task 4), per-serving + whole-recipe (Tasks 6, 9), label UI (Tasks 9, 10), data contract (Task 6 → 9). All covered.
- **Type consistency:** `parseIngredient` → `{ quantity, unit, name }` consumed verbatim by `combine.js`; `parseFoodDescription` → `{ basis:{type,grams|unit|count}, calories, fat, carbs, protein }` consumed by `combine.js`; the contract `{ servings, totals, perServing, items, estimated }` produced by `combine.js` matches the card's reads in Task 9.
- **Units note:** `parseIngredient` returns the raw lowercased unit token (`'cup'`/`'cups'`); `units.js` includes both singular and plural keys, so they convert identically.
