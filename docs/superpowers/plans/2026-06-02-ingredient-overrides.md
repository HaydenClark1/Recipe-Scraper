# Ingredient Editing & Persisted Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user replace a bad food match, fix a misparsed amount, or exclude an ingredient line — on any recipe with live recompute — and persist those edits per user against their `SavedRecipe`.

**Architecture:** Backend stays the single source of the scaling math: `combine.js` gains an `overrides` argument; a new `/search-foods` returns candidate foods. Overrides persist in a new `IngredientOverride` table (child of `SavedRecipe`). The frontend holds a working override array in a hook, drives live recompute through `/get-nutrition`, and persists on save (`POST /saved-recipes`) or on edit-modal close for already-saved recipes (`PUT /saved-recipes/:id/overrides`). The UI is a read-only `NutritionCard` plus an "Edit ingredients" popup.

**Tech Stack:** Node/Express + Prisma (SQL Server) backend with `node --test`; React (Vite) + Capacitor frontend with Vitest + Testing Library. Frontend components are built using the `ui-ux-pro-max` skill and validated at phone widths (~360–414px).

**Spec:** `docs/superpowers/specs/2026-06-02-ingredient-overrides-design.md`

**Canonical override wire shape** (used by recompute, create, and update):
```js
{ index, type: 'replace' | 'exclude' | 'amount',
  foodName?, foodDescription?, fdcId?,   // replace
  quantity?, unit? }                     // amount
```

---

## File Structure

**Backend**
- Modify `backend/prisma/schema.prisma` — add `IngredientOverride`, relation on `SavedRecipe`.
- Modify `backend/nutrition/combine.js` — apply overrides per ingredient index.
- Modify `backend/nutrition/usdaClient.js` — add `makeUsdaSearchMany` (top-N candidates).
- Modify `backend/nutrition/foodResolver.js` — add `makeFoodsResolver` (many).
- Modify `backend/server.js` — wire `resolveFoods`; add `GET /search-foods`; pass `overrides` into `/get-nutrition`.
- Modify `backend/recipes/savedRecipeHandlers.js` — override (de)serialization, create-with-overrides, replace-overrides handler.
- Modify `backend/recipes/savedRecipeRoutes.js` — add `PUT /:id/overrides`.

**Frontend**
- Modify `frontend/src/api/client.js` — add `apiPut`.
- Create `frontend/src/api/foods.js` — `searchFoods(q)`.
- Modify `frontend/src/api/recipes.js` — `getNutrition(ingredients, servings, overrides)`.
- Modify `frontend/src/api/savedRecipes.js` — `createSavedRecipe(recipe, overrides)`, `updateOverrides(id, overrides)`.
- Modify `frontend/src/hooks/useSavedRecipes.js` — `add(recipe, overrides)`.
- Create `frontend/src/hooks/useIngredientOverrides.js` — working override state.
- Create `frontend/src/components/EditIngredientsModal.jsx` (+ `.css`) — the edit popup.
- Modify `frontend/src/components/cards/NutritionCard.jsx` — edit button, pass overrides into recompute.
- Modify `frontend/src/pages/RecipeDetailPage.jsx` — own override state; persist on save / modal close.

---

## Task 1: IngredientOverride schema + relation

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the relation field to `SavedRecipe`**

In `model SavedRecipe`, add this line after `createdAt`:
```prisma
  overrides    IngredientOverride[]
```

- [ ] **Step 2: Add the `IngredientOverride` model**

Append to `schema.prisma`:
```prisma
model IngredientOverride {
  id              Int         @id @default(autoincrement())
  savedRecipeId   Int
  savedRecipe     SavedRecipe @relation(fields: [savedRecipeId], references: [id], onDelete: Cascade)
  ingredientIndex Int
  type            String      @db.NVarChar(20)

  foodName        String?     @db.NVarChar(500)
  foodDescription String?     @db.NVarChar(1000)
  fdcId           Int?

  quantity        Float?
  unit            String?     @db.NVarChar(50)

  createdAt       DateTime    @default(now())

  @@index([savedRecipeId])
  @@unique([savedRecipeId, ingredientIndex, type])
}
```

- [ ] **Step 3: Push the schema and regenerate the client**

Run (from `backend/`): `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema" and "Generated Prisma Client". (This repo uses `db push`, not migration files.)

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add IngredientOverride model"
```

---

## Task 2: Apply overrides in combine.js

**Files:**
- Modify: `backend/nutrition/combine.js`
- Test: `backend/nutrition/__tests__/combine.test.js`

- [ ] **Step 1: Write failing tests**

Append to `backend/nutrition/__tests__/combine.test.js`:
```js
test('exclude override zeroes a line and flags it', async () => {
  const searchFood = async () => ({ food_name: 'X', food_description: 'Per 100g - Calories: 100kcal | Fat: 1g | Carbs: 1g | Protein: 1g' })
  const overrides = [{ index: 0, type: 'exclude' }]
  const { items, totals } = await combineNutrition(['1 g salt'], null, { searchFood, overrides })
  assert.strictEqual(items[0].excluded, true)
  assert.strictEqual(items[0].calories, 0)
  assert.strictEqual(totals.calories, 0)
})

test('replace override uses the given food instead of searching', async () => {
  let searched = false
  const searchFood = async () => { searched = true; return null }
  const overrides = [{ index: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'Per 100g - Calories: 200kcal | Fat: 5g | Carbs: 0g | Protein: 30g' }]
  const { items } = await combineNutrition(['100 g chicken'], null, { searchFood, overrides })
  assert.strictEqual(searched, false)
  assert.strictEqual(items[0].overridden, true)
  assert.strictEqual(items[0].matchedName, 'Chicken')
  assert.strictEqual(items[0].calories, 200)
})

test('amount override changes the scaling quantity', async () => {
  const searchFood = async () => ({ food_name: 'Garlic', food_description: 'Per 100g - Calories: 100kcal | Fat: 0g | Carbs: 20g | Protein: 5g' })
  const overrides = [{ index: 0, type: 'amount', quantity: 200, unit: 'g' }]
  const { items } = await combineNutrition(['1 g garlic'], null, { searchFood, overrides })
  assert.strictEqual(items[0].calories, 200) // 200g of a per-100g food
})

test('out-of-range override index is ignored', async () => {
  const searchFood = async () => null
  const overrides = [{ index: 5, type: 'exclude' }]
  const { items } = await combineNutrition(['1 g salt'], null, { searchFood, overrides })
  assert.strictEqual(items.length, 1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `node --test nutrition/__tests__/combine.test.js`
Expected: FAIL (overrides not applied; no `excluded`/`overridden` flags).

- [ ] **Step 3: Implement override application**

In `backend/nutrition/combine.js`, change the signature and loop. Replace the function header:
```js
async function combineNutrition(ingredients, servings, { searchFood, overrides = [] }) {
  const items = []
  const totals = { calories: 0, fat: 0, carbs: 0, protein: 0 }
  let estimated = false

  // index -> { replace?, amount?, exclude? }
  const ovByIndex = new Map()
  for (const o of overrides || []) {
    if (!ovByIndex.has(o.index)) ovByIndex.set(o.index, {})
    ovByIndex.get(o.index)[o.type] = o
  }

  const lines = ingredients || []
  for (let i = 0; i < lines.length; i++) {
    const ov = ovByIndex.get(i) || {}
    let { quantity, unit, name } = parseIngredient(lines[i])
    if (ov.amount) { quantity = ov.amount.quantity; unit = ov.amount.unit }

    if (ov.exclude) {
      items.push({ name, matched: false, excluded: true, overridden: true, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }

    let match = null
    if (ov.replace) {
      match = { food_name: ov.replace.foodName, food_description: ov.replace.foodDescription }
    } else {
      try { match = await searchFood(cleanForSearch(name)) } catch { match = null }
    }
    const desc = match && parseFoodDescription(match.food_description)

    if (!desc) {
      estimated = true
      items.push({ name, matched: false, excluded: false, overridden: !!ov.replace, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 })
      continue
    }
```

Keep the existing scaling block (the `const grams = toGrams(...)` through `if (approx) estimated = true`) unchanged. Then replace the `const item = {...}` object with:
```js
    const item = {
      name,
      matched: true,
      excluded: false,
      overridden: !!(ov.replace || ov.amount),
      matchedName: match.food_name || null,
      matchedBasis: match.food_description || null,
      scaleFactor: round(scale, 4),
      grams: grams != null ? round(grams, 1) : null,
      calories: Math.round((desc.calories || 0) * scale),
      fat: round((desc.fat || 0) * scale, 1),
      carbs: round((desc.carbs || 0) * scale, 1),
      protein: round((desc.protein || 0) * scale, 1),
    }
```
Leave the totals accumulation and the rest of the function unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `node --test nutrition/__tests__/combine.test.js`
Expected: PASS (all old + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/combine.js backend/nutrition/__tests__/combine.test.js
git commit -m "feat: apply ingredient overrides in combineNutrition"
```

---

## Task 3: Multi-result food search

**Files:**
- Modify: `backend/nutrition/usdaClient.js`
- Modify: `backend/nutrition/foodResolver.js`
- Test: `backend/nutrition/__tests__/usdaClient.test.js`, `backend/nutrition/__tests__/foodResolver.test.js`

- [ ] **Step 1: Write failing test for `makeUsdaSearchMany`**

Append to `backend/nutrition/__tests__/usdaClient.test.js`:
```js
const { buildIndex, makeUsdaSearchMany } = require('../usdaClient')

test('makeUsdaSearchMany returns up to N candidates in result shape', async () => {
  const foods = [
    { fdcId: 1, description: 'Chicken breast, grilled', calories: 165, fat: 3, carbs: 0, protein: 31 },
    { fdcId: 2, description: 'Chicken breast, roasted', calories: 187, fat: 7, carbs: 0, protein: 29 },
    { fdcId: 3, description: 'Chicken, broth', calories: 7, fat: 0, carbs: 0, protein: 1 },
  ]
  const searchFoods = makeUsdaSearchMany(buildIndex(foods), foods, 2)
  const out = await searchFoods('chicken breast')
  assert.ok(out.length <= 2 && out.length >= 1)
  assert.ok('food_name' in out[0] && 'food_description' in out[0])
  assert.strictEqual(out[0].fdcId, foods.find((f) => f.description === out[0].food_name).fdcId)
})

test('makeUsdaSearchMany returns [] for short queries', async () => {
  const searchFoods = makeUsdaSearchMany(buildIndex([]), [], 5)
  assert.deepStrictEqual(await searchFoods('a'), [])
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `backend/`): `node --test nutrition/__tests__/usdaClient.test.js`
Expected: FAIL ("makeUsdaSearchMany is not a function").

- [ ] **Step 3: Implement `makeUsdaSearchMany`**

In `backend/nutrition/usdaClient.js`, add before `module.exports`:
```js
// Multi-result variant for the "replace match" picker: top-N fuzzy candidates.
function makeUsdaSearchMany(index, foods, limit = 15) {
  const toResult = (food) => ({
    food_name: food.description,
    food_description: formatDescription(food),
    fdcId: food.fdcId,
  })
  return async function searchFoods(name) {
    if (!name || name.trim().length < 2) return []
    return index.search(name).slice(0, limit).map((h) => toResult(h.item))
  }
}
```
Add `makeUsdaSearchMany` to the `module.exports` object.

- [ ] **Step 4: Write failing test for `makeFoodsResolver`**

Append to `backend/nutrition/__tests__/foodResolver.test.js`:
```js
const { makeFoodsResolver } = require('../foodResolver')

test('makeFoodsResolver returns USDA candidates when present', async () => {
  const resolve = makeFoodsResolver({
    usdaSearchMany: async () => [{ food_name: 'A', food_description: 'd' }],
    fatsecretSearchMany: async () => [{ food_name: 'B', food_description: 'd2' }],
  })
  assert.deepStrictEqual((await resolve('x'))[0].food_name, 'A')
})

test('makeFoodsResolver falls back to FatSecret when USDA empty', async () => {
  const resolve = makeFoodsResolver({
    usdaSearchMany: async () => [],
    fatsecretSearchMany: async () => [{ food_name: 'B', food_description: 'd2' }],
  })
  assert.deepStrictEqual((await resolve('x'))[0].food_name, 'B')
})
```

- [ ] **Step 5: Run to verify fail**

Run: `node --test nutrition/__tests__/foodResolver.test.js`
Expected: FAIL ("makeFoodsResolver is not a function").

- [ ] **Step 6: Implement `makeFoodsResolver`**

In `backend/nutrition/foodResolver.js`, add before `module.exports`:
```js
// Multi-result composition for /search-foods.
function makeFoodsResolver({ usdaSearchMany, fatsecretSearchMany }) {
  return async function searchFoods(name) {
    try {
      const usda = await usdaSearchMany(name)
      if (usda && usda.length) return usda
    } catch {
      // fall through
    }
    if (!fatsecretSearchMany) return []
    try {
      return await fatsecretSearchMany(name)
    } catch {
      return []
    }
  }
}
```
Add `makeFoodsResolver` to `module.exports`.

- [ ] **Step 7: Run both test files to verify pass**

Run: `node --test nutrition/__tests__/usdaClient.test.js nutrition/__tests__/foodResolver.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/nutrition/usdaClient.js backend/nutrition/foodResolver.js backend/nutrition/__tests__/usdaClient.test.js backend/nutrition/__tests__/foodResolver.test.js
git commit -m "feat: add multi-result food search"
```

---

## Task 4: Wire /search-foods and overrides into server.js

**Files:**
- Modify: `backend/server.js`

(No unit test — exercised manually in Step 4; route logic is thin and the resolvers are tested in Task 3.)

- [ ] **Step 1: Import the multi-result builders and add a `resolveFoods` default**

In `backend/server.js`, update the resolver imports:
```js
const { makeFoodResolver, makeFoodsResolver } = require("./nutrition/foodResolver");
const { loadFoods, buildIndex, makeUsdaSearch, makeUsdaSearchMany } = require("./nutrition/usdaClient");
```
After the `let resolveFood = ...` line, add:
```js
const fatsecretSearchMany = async (q) => { const r = await fatsecretSearch(q); return r ? [r] : []; };
let resolveFoods = makeFoodsResolver({ usdaSearchMany: async () => [], fatsecretSearchMany });
```

- [ ] **Step 2: Populate `resolveFoods` once the USDA index loads**

Inside `initNutrition`, after the existing `resolveFood = makeFoodResolver(...)` line, add:
```js
    resolveFoods = makeFoodsResolver({ usdaSearchMany: makeUsdaSearchMany(index, foods), fatsecretSearchMany });
```

- [ ] **Step 3: Add the `/search-foods` route and pass `overrides` into `/get-nutrition`**

Add this route (near `/get-nutrition`):
```js
app.get('/search-foods', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.status(400).json({ error: 'query too short' });
  try {
    const foods = await resolveFoods(q);
    return res.status(200).json({ foods });
  } catch (err) {
    console.error('Food search failed:', err.message);
    return res.status(500).json({ error: 'Failed to search foods' });
  }
});
```
In the existing `/get-nutrition` handler, change the destructure and the call:
```js
  const { ingredients, servings, overrides } = req.body;
```
```js
    const result = await combineNutrition(ingredients, servings, { searchFood: resolveFood, overrides });
```

- [ ] **Step 4: Smoke-test the server**

Run (from `backend/`): `node -e "require('./server.js')"` is not appropriate (it listens); instead start it: `node server.js` in one terminal, then:
`curl "http://localhost:7000/search-foods?q=ch"` → `{"foods":[...]}` (or `[]` before the index loads); `curl "http://localhost:7000/search-foods?q=a"` → `400`.
Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat: add /search-foods route and overrides on /get-nutrition"
```

---

## Task 5: Persist overrides in saved-recipe handlers

**Files:**
- Modify: `backend/recipes/savedRecipeHandlers.js`
- Modify: `backend/recipes/savedRecipeRoutes.js`
- Test: `backend/recipes/__tests__/savedRecipeHandlers.test.js`

- [ ] **Step 1: Write failing tests**

Append to `backend/recipes/__tests__/savedRecipeHandlers.test.js`:
```js
const { makeReplaceOverridesHandler } = require('../savedRecipeHandlers')

test('deserializeRecipe maps override rows to wire shape', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null, ingredients: '["i"]', instructions: '["s"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    overrides: [
      { ingredientIndex: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'd', fdcId: 9, quantity: null, unit: null },
      { ingredientIndex: 2, type: 'exclude', foodName: null, foodDescription: null, fdcId: null, quantity: null, unit: null },
    ],
  })
  assert.deepStrictEqual(r.overrides[0], { index: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'd', fdcId: 9 })
  assert.deepStrictEqual(r.overrides[1], { index: 2, type: 'exclude' })
})

test('create persists nested override rows', async () => {
  let createArg = null
  const prisma = { savedRecipe: { create: async (arg) => { createArg = arg; return { id: 2, ...arg.data, overrides: [] } } } }
  const res = mockRes()
  const req = { userId: 9, body: { recipe: { title: 'B', ingredients: ['i'], instructions: ['s'] }, overrides: [{ index: 0, type: 'exclude' }] } }
  await makeCreateHandler(prisma)(req, res)
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(createArg.data.overrides.create[0].ingredientIndex, 0)
  assert.strictEqual(createArg.data.overrides.create[0].type, 'exclude')
})

test('replaceOverrides 404 when recipe not owned', async () => {
  const prisma = { savedRecipe: { findFirst: async () => null } }
  const res = mockRes()
  await makeReplaceOverridesHandler(prisma)({ userId: 9, params: { id: '5' }, body: { overrides: [] } }, res)
  assert.strictEqual(res.statusCode, 404)
})

test('replaceOverrides deletes then recreates the set', async () => {
  const calls = []
  const prisma = {
    savedRecipe: { findFirst: async () => ({ id: 5, overrides: [] }) },
    ingredientOverride: { deleteMany: async (a) => { calls.push(['del', a]); }, createMany: async (a) => { calls.push(['create', a]); } },
    $transaction: async (ops) => Promise.all(ops),
  }
  // Make deleteMany/createMany return thenables usable by $transaction's Promise.all
  prisma.ingredientOverride.deleteMany = async (a) => calls.push(['del', a.where.savedRecipeId])
  prisma.ingredientOverride.createMany = async (a) => calls.push(['create', a.data.length])
  const res = mockRes()
  await makeReplaceOverridesHandler(prisma)({ userId: 9, params: { id: '5' }, body: { overrides: [{ index: 0, type: 'exclude' }] } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(calls, [['del', 5], ['create', 1]])
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `backend/`): `node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: FAIL ("makeReplaceOverridesHandler is not a function" and override assertions).

- [ ] **Step 3: Implement override (de)serialization + handlers**

In `backend/recipes/savedRecipeHandlers.js`, add helpers near the top:
```js
function toOverrideRow(o) {
  return {
    ingredientIndex: o.index,
    type: o.type,
    foodName: o.foodName ?? null,
    foodDescription: o.foodDescription ?? null,
    fdcId: o.fdcId ?? null,
    quantity: o.quantity ?? null,
    unit: o.unit ?? null,
  }
}

function fromOverrideRow(r) {
  const o = { index: r.ingredientIndex, type: r.type }
  if (r.type === 'replace') {
    o.foodName = r.foodName
    o.foodDescription = r.foodDescription
    if (r.fdcId != null) o.fdcId = r.fdcId
  } else if (r.type === 'amount') {
    o.quantity = r.quantity
    o.unit = r.unit
  }
  return o
}
```
In `deserializeRecipe`, add to the returned object:
```js
    overrides: (row.overrides || []).map(fromOverrideRow),
```
Replace `makeListHandler` body's query to include overrides:
```js
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId }, include: { overrides: true } })
```
Replace `makeCreateHandler` body:
```js
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : []
    const data = serializeRecipe(recipe, req.userId)
    if (overrides.length) data.overrides = { create: overrides.map(toOverrideRow) }
    const row = await prisma.savedRecipe.create({ data, include: { overrides: true } })
    return res.status(201).json({ recipe: deserializeRecipe(row) })
  }
```
Add a new handler:
```js
function makeReplaceOverridesHandler(prisma) {
  return async function replace(req, res) {
    const id = Number(req.params.id)
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : []
    const owned = await prisma.savedRecipe.findFirst({ where: { id, userId: req.userId } })
    if (!owned) return res.status(404).json({ error: 'Recipe not found' })
    const ops = [prisma.ingredientOverride.deleteMany({ where: { savedRecipeId: id } })]
    if (overrides.length) {
      ops.push(prisma.ingredientOverride.createMany({ data: overrides.map((o) => ({ ...toOverrideRow(o), savedRecipeId: id })) }))
    }
    await prisma.$transaction(ops)
    const row = await prisma.savedRecipe.findFirst({ where: { id, userId: req.userId }, include: { overrides: true } })
    return res.status(200).json({ recipe: deserializeRecipe(row) })
  }
}
```
Add `makeReplaceOverridesHandler`, `toOverrideRow`, `fromOverrideRow` to `module.exports`.

> Note: the Task-5 unit tests stub `deleteMany`/`createMany` to push to `calls`, so `$transaction` receives plain values — fine for the test. In production, Prisma's `$transaction([...])` receives the unawaited query promises; do not `await` the individual ops before passing them in.

- [ ] **Step 4: Add the PUT route**

In `backend/recipes/savedRecipeRoutes.js`:
```js
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeReplaceOverridesHandler } = require('./savedRecipeHandlers')
```
Add inside `createSavedRecipeRouter`, before `return router`:
```js
  router.put('/:id/overrides', makeReplaceOverridesHandler(prisma))
```

- [ ] **Step 5: Run to verify pass**

Run (from `backend/`): `node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: PASS (old + new tests).

- [ ] **Step 6: Commit**

```bash
git add backend/recipes/savedRecipeHandlers.js backend/recipes/savedRecipeRoutes.js backend/recipes/__tests__/savedRecipeHandlers.test.js
git commit -m "feat: persist ingredient overrides on saved recipes"
```

---

## Task 6: Frontend API helpers

**Files:**
- Modify: `frontend/src/api/client.js`
- Create: `frontend/src/api/foods.js`
- Modify: `frontend/src/api/recipes.js`
- Modify: `frontend/src/api/savedRecipes.js`
- Test: `frontend/src/api/__tests__/recipes.test.js`

- [ ] **Step 1: Add `apiPut` to client.js**

In `frontend/src/api/client.js`, after `apiDelete`:
```js
export const apiPut = (path, body) => request(path, { method: 'PUT', body })
```

- [ ] **Step 2: Create `foods.js`**

Create `frontend/src/api/foods.js`:
```js
import { apiGet } from './client.js'

export const searchFoods = (q) => apiGet(`/search-foods?q=${encodeURIComponent(q)}`)
```

- [ ] **Step 3: Extend recipes.js and savedRecipes.js**

In `frontend/src/api/recipes.js`, replace `getNutrition`:
```js
export const getNutrition = (ingredients, servings, overrides) =>
  apiClient('/get-nutrition', { ingredients, servings, overrides })
```
In `frontend/src/api/savedRecipes.js`:
```js
import { apiClient, apiGet, apiDelete, apiPut } from './client.js'

export const listSavedRecipes = () => apiGet('/saved-recipes')
export const createSavedRecipe = (recipe, overrides) => apiClient('/saved-recipes', { recipe, overrides })
export const deleteSavedRecipe = (id) => apiDelete(`/saved-recipes/${id}`)
export const updateOverrides = (id, overrides) => apiPut(`/saved-recipes/${id}/overrides`, { overrides })
```

- [ ] **Step 4: Write + run a test for the getNutrition override pass-through**

Append to `frontend/src/api/__tests__/recipes.test.js` (follow the existing mock style in that file; this asserts the body shape):
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getNutrition } from '../recipes.js'

describe('getNutrition overrides', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ items: [] }) })
  })
  it('sends ingredients, servings, and overrides in the body', async () => {
    await getNutrition(['1 egg'], '2', [{ index: 0, type: 'exclude' }])
    const [, opts] = global.fetch.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ ingredients: ['1 egg'], servings: '2', overrides: [{ index: 0, type: 'exclude' }] })
  })
})
```
Run (from `frontend/`): `npm run test -- src/api/__tests__/recipes.test.js`
Expected: PASS. (If the existing file already mocks `fetch`/`apiClient` differently, match that pattern instead of redefining `global.fetch`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/foods.js frontend/src/api/recipes.js frontend/src/api/savedRecipes.js frontend/src/api/__tests__/recipes.test.js
git commit -m "feat: frontend API helpers for food search and overrides"
```

---

## Task 7: useIngredientOverrides hook

**Files:**
- Create: `frontend/src/hooks/useIngredientOverrides.js`
- Test: `frontend/src/hooks/__tests__/useIngredientOverrides.test.js`

- [ ] **Step 1: Write failing test**

Create `frontend/src/hooks/__tests__/useIngredientOverrides.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIngredientOverrides } from '../useIngredientOverrides.js'

describe('useIngredientOverrides', () => {
  it('seeds from initial overrides', () => {
    const { result } = renderHook(() => useIngredientOverrides([{ index: 1, type: 'exclude' }]))
    expect(result.current.overrides).toEqual([{ index: 1, type: 'exclude' }])
  })

  it('replace adds/updates a replace override for an index', () => {
    const { result } = renderHook(() => useIngredientOverrides([]))
    act(() => result.current.replace(0, { food_name: 'Chicken', food_description: 'd', fdcId: 9 }))
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'd', fdcId: 9 },
    ])
    act(() => result.current.replace(0, { food_name: 'Beef', food_description: 'd2' }))
    expect(result.current.overrides.filter((o) => o.type === 'replace')).toHaveLength(1)
    expect(result.current.overrides[0].foodName).toBe('Beef')
  })

  it('setAmount and exclude/unexclude manage their own override rows', () => {
    const { result } = renderHook(() => useIngredientOverrides([]))
    act(() => result.current.setAmount(2, 3, 'clove'))
    act(() => result.current.exclude(2))
    expect(result.current.overrides).toContainEqual({ index: 2, type: 'amount', quantity: 3, unit: 'clove' })
    expect(result.current.overrides).toContainEqual({ index: 2, type: 'exclude' })
    act(() => result.current.unexclude(2))
    expect(result.current.overrides.some((o) => o.index === 2 && o.type === 'exclude')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/hooks/__tests__/useIngredientOverrides.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useIngredientOverrides.js`:
```js
import { useState, useCallback } from 'react'

// Working override set for the recipe being viewed. Keyed by (index, type):
// at most one of each type per ingredient line.
export function useIngredientOverrides(initial = []) {
  const [overrides, setOverrides] = useState(initial)

  const upsert = useCallback((index, type, fields) => {
    setOverrides((prev) => {
      const rest = prev.filter((o) => !(o.index === index && o.type === type))
      return [...rest, { index, type, ...fields }]
    })
  }, [])

  const removeType = useCallback((index, type) => {
    setOverrides((prev) => prev.filter((o) => !(o.index === index && o.type === type)))
  }, [])

  const replace = useCallback((index, food) => {
    const fields = { foodName: food.food_name, foodDescription: food.food_description }
    if (food.fdcId != null) fields.fdcId = food.fdcId
    upsert(index, 'replace', fields)
  }, [upsert])

  const setAmount = useCallback((index, quantity, unit) => {
    upsert(index, 'amount', { quantity, unit })
  }, [upsert])

  const exclude = useCallback((index) => upsert(index, 'exclude', {}), [upsert])
  const unexclude = useCallback((index) => removeType(index, 'exclude'), [removeType])

  return { overrides, replace, setAmount, exclude, unexclude }
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/hooks/__tests__/useIngredientOverrides.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useIngredientOverrides.js frontend/src/hooks/__tests__/useIngredientOverrides.test.js
git commit -m "feat: add useIngredientOverrides hook"
```

---

## Task 8: EditIngredientsModal component

**Files:**
- Create: `frontend/src/components/EditIngredientsModal.jsx`
- Create: `frontend/src/components/EditIngredientsModal.css`
- Test: `frontend/src/components/__tests__/EditIngredientsModal.test.jsx`

> **Build this component using the `ui-ux-pro-max` skill** for layout, styling, and accessibility. It must work as a full-height sheet at phone widths (~360–414px), with finger-sized tap targets. The code below is the functional baseline; refine the markup/CSS through the skill without changing the prop contract.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/EditIngredientsModal.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditIngredientsModal } from '../EditIngredientsModal.jsx'

vi.mock('../../api/foods.js', () => ({
  searchFoods: vi.fn().mockResolvedValue({ foods: [{ food_name: 'Chicken breast, grilled', food_description: 'Per 100g - Calories: 165kcal' }] }),
}))

const ingredients = ['2 chicken breasts', 'salt to taste']
const items = [
  { name: '2 chicken breasts', matched: true, matchedName: 'chicken broth', calories: 14, excluded: false },
  { name: 'salt to taste', matched: true, matchedName: 'salt', calories: 0, excluded: false },
]

function setup(extra = {}) {
  const actions = { replace: vi.fn(), setAmount: vi.fn(), exclude: vi.fn(), unexclude: vi.fn() }
  render(<EditIngredientsModal ingredients={ingredients} items={items} overrides={[]} actions={actions} onClose={vi.fn()} {...extra} />)
  return actions
}

describe('EditIngredientsModal', () => {
  it('lists every ingredient with its current match', () => {
    setup()
    expect(screen.getByText('2 chicken breasts')).toBeInTheDocument()
    expect(screen.getByText(/chicken broth/)).toBeInTheDocument()
  })

  it('exclude calls actions.exclude with the row index', () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /exclude/i })[0])
    expect(actions.exclude).toHaveBeenCalledWith(0)
  })

  it('replace flow searches and applies a picked food', async () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value: 'chicken breast' } })
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => screen.getByText('Chicken breast, grilled'))
    fireEvent.click(screen.getByText('Chicken breast, grilled'))
    expect(actions.replace).toHaveBeenCalledWith(0, expect.objectContaining({ food_name: 'Chicken breast, grilled' }))
  })

  it('amount flow applies a quantity/unit override', () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: 'clove' } })
    fireEvent.click(screen.getByRole('button', { name: /apply amount/i }))
    expect(actions.setAmount).toHaveBeenCalledWith(0, 3, 'clove')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/components/__tests__/EditIngredientsModal.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/EditIngredientsModal.jsx`:
```jsx
import { useState } from 'react'
import { searchFoods } from '../api/foods.js'
import './EditIngredientsModal.css'

function isExcluded(overrides, index) {
  return overrides.some((o) => o.index === index && o.type === 'exclude')
}

function ReplaceView({ ingredient, onPick, onBack }) {
  const [q, setQ] = useState(ingredient)
  const [results, setResults] = useState([])
  const [state, setState] = useState('idle') // idle | loading | error | empty

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
    <div className="edit-replace">
      <button className="edit-replace__back" onClick={onBack} aria-label="Back">‹ Back</button>
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
      {state === 'loading' && <p className="edit-note">Searching…</p>}
      {state === 'error' && <p className="edit-note">Search unavailable, try again.</p>}
      {state === 'empty' && <p className="edit-note">No matches — try a simpler term.</p>}
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
      <input className="edit-amount__qty" inputMode="decimal" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity" />
      <input className="edit-amount__unit" placeholder="Unit (g, cup…)" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
      <button onClick={() => qty && onApply(Number(qty), unit.trim())} aria-label="Apply amount">Apply</button>
      <button onClick={onCancel} aria-label="Cancel amount">Cancel</button>
    </div>
  )
}

export function EditIngredientsModal({ ingredients, items, overrides, actions, onClose }) {
  const [replacingIndex, setReplacingIndex] = useState(null)
  const [amountIndex, setAmountIndex] = useState(null)

  if (replacingIndex != null) {
    return (
      <div className="edit-modal" role="dialog" aria-label="Replace ingredient match">
        <ReplaceView
          ingredient={ingredients[replacingIndex]}
          onBack={() => setReplacingIndex(null)}
          onPick={(food) => { actions.replace(replacingIndex, food); setReplacingIndex(null) }}
        />
      </div>
    )
  }

  return (
    <div className="edit-modal" role="dialog" aria-label="Edit ingredients">
      <header className="edit-modal__header">
        <span>Edit ingredients</span>
        <button className="edit-modal__close" onClick={onClose} aria-label="Close">✕</button>
      </header>
      <ul className="edit-modal__list">
        {ingredients.map((ing, i) => {
          const item = items[i] || {}
          const excluded = isExcluded(overrides, i)
          return (
            <li key={i} className={`edit-row${excluded ? ' edit-row--excluded' : ''}`}>
              <div className="edit-row__name">{ing}</div>
              <div className="edit-row__match">
                {excluded ? 'excluded' : item.matched ? `${item.matchedName} · ${item.calories} cal` : 'no match'}
              </div>
              <div className="edit-row__actions">
                <button onClick={() => setReplacingIndex(i)}>Replace</button>
                <button onClick={() => setAmountIndex(amountIndex === i ? null : i)}>Amount</button>
                {excluded
                  ? <button onClick={() => actions.unexclude(i)}>Undo</button>
                  : <button onClick={() => actions.exclude(i)}>Exclude</button>}
              </div>
              {amountIndex === i && (
                <AmountEditor
                  onApply={(q, u) => { actions.setAmount(i, q, u); setAmountIndex(null) }}
                  onCancel={() => setAmountIndex(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
      <footer className="edit-modal__footer">
        <button className="edit-modal__done" onClick={onClose}>Done</button>
      </footer>
    </div>
  )
}
```
Create `frontend/src/components/EditIngredientsModal.css` with a mobile-first full-height sheet (refine via the ui-ux-pro-max skill):
```css
.edit-modal {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; flex-direction: column;
  background: #fff;
}
.edit-modal__header, .edit-modal__footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #eee; font-weight: 600;
}
.edit-modal__footer { border-top: 1px solid #eee; border-bottom: none; }
.edit-modal__list { flex: 1; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.edit-row { padding: 12px 16px; border-bottom: 1px solid #f2f2f2; }
.edit-row--excluded .edit-row__name { text-decoration: line-through; opacity: .5; }
.edit-row__match { font-size: 12px; color: #888; margin-top: 2px; }
.edit-row__actions { display: flex; gap: 8px; margin-top: 8px; }
.edit-row__actions button, .edit-modal__done {
  min-height: 40px; padding: 6px 14px; border-radius: 10px;
  border: 1px solid #ddd; background: #fafafa; font-size: 14px;
}
.edit-modal__done { width: 100%; font-weight: 600; }
.edit-replace { display: flex; flex-direction: column; height: 100%; padding: 16px; gap: 12px; }
.edit-replace__search { display: flex; gap: 8px; }
.edit-replace__input { flex: 1; min-height: 44px; padding: 8px 12px; border: 1px solid #ddd; border-radius: 10px; }
.edit-replace__results { list-style: none; margin: 0; padding: 0; overflow-y: auto; }
.edit-replace__result { display: flex; flex-direction: column; width: 100%; text-align: left; padding: 12px 8px; border: none; border-bottom: 1px solid #f2f2f2; background: none; }
.edit-replace__basis { font-size: 12px; color: #888; }
.edit-note { color: #888; font-size: 13px; }
.edit-amount { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.edit-amount__qty { width: 72px; min-height: 40px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 10px; }
.edit-amount__unit { flex: 1; min-width: 110px; min-height: 40px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 10px; }
.edit-amount button { min-height: 40px; padding: 6px 14px; border: 1px solid #ddd; border-radius: 10px; background: #fafafa; }
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/components/__tests__/EditIngredientsModal.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EditIngredientsModal.jsx frontend/src/components/EditIngredientsModal.css frontend/src/components/__tests__/EditIngredientsModal.test.jsx
git commit -m "feat: add EditIngredientsModal"
```

---

## Task 9: Wire editing into NutritionCard + RecipeDetailPage

**Files:**
- Modify: `frontend/src/components/cards/NutritionCard.jsx`
- Modify: `frontend/src/hooks/useSavedRecipes.js`
- Modify: `frontend/src/pages/RecipeDetailPage.jsx`
- Test: `frontend/src/components/cards/__tests__/NutritionCard.test.jsx` (create if absent)

- [ ] **Step 1: Write failing test for NutritionCard passing overrides**

Create/extend `frontend/src/components/cards/__tests__/NutritionCard.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'
import * as recipesApi from '../../../api/recipes.js'

vi.mock('../../../api/recipes.js')

const recipe = { ingredients: ['2 chicken breasts'], servings: '2' }

describe('NutritionCard editing', () => {
  beforeEach(() => {
    // recipesApi.getNutrition is already a vi.fn() from the auto-mock above.
    // Mutate it (don't reassign) so the component's imported binding stays live.
    recipesApi.getNutrition.mockReset()
    recipesApi.getNutrition.mockResolvedValue({
      perServing: { calories: 100, fat: 1, carbs: 1, protein: 1 },
      totals: { calories: 200, fat: 2, carbs: 2, protein: 2 },
      items: [{ name: '2 chicken breasts', matched: true, matchedName: 'chicken broth', calories: 14, excluded: false }],
      servings: 2,
    })
  })

  it('passes overrides into getNutrition', async () => {
    render(<NutritionCard recipe={recipe} overrides={[{ index: 0, type: 'exclude' }]} actions={{}} />)
    await waitFor(() => expect(recipesApi.getNutrition).toHaveBeenCalledWith(recipe.ingredients, recipe.servings, [{ index: 0, type: 'exclude' }]))
  })

  it('opens the edit modal from the Edit ingredients button', async () => {
    const actions = { replace: vi.fn(), setAmount: vi.fn(), exclude: vi.fn(), unexclude: vi.fn() }
    render(<NutritionCard recipe={recipe} overrides={[]} actions={actions} />)
    await waitFor(() => screen.getByRole('button', { name: /edit ingredients/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit ingredients/i }))
    expect(screen.getByRole('dialog', { name: /edit ingredients/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/components/cards/__tests__/NutritionCard.test.jsx`
Expected: FAIL (NutritionCard ignores `overrides`/`actions`; no edit button).

- [ ] **Step 3: Update NutritionCard**

In `frontend/src/components/cards/NutritionCard.jsx`:
- Add imports:
```js
import { EditIngredientsModal } from '../EditIngredientsModal.jsx'
```
- Change the component signature and add modal state + override-aware fetch:
```js
export function NutritionCard({ recipe, overrides = [], actions, onEditDone }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState(false)
```
- Replace the effect dependency + call to include overrides:
```js
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
```
- Add an "Edit ingredients" button inside the `nutrition-card` div (e.g. just before `<IngredientBreakdown .../>`), shown when there are ingredients and `actions` is provided:
```js
          {actions && recipe.ingredients.length > 0 && (
            <button className="nutrition-edit-btn" onClick={() => setEditing(true)}>
              ✎ Edit ingredients
            </button>
          )}
```
- Render the modal at the end of the returned tree (inside the outer div):
```js
      {editing && data && (
        <EditIngredientsModal
          ingredients={recipe.ingredients}
          items={data.items}
          overrides={overrides}
          actions={actions}
          onClose={() => { setEditing(false); onEditDone && onEditDone() }}
        />
      )}
```
- Add a minimal style for `.nutrition-edit-btn` in `NutritionCard.css` (full-width, ≥40px tall; refine via ui-ux-pro-max skill).

- [ ] **Step 4: Extend `useSavedRecipes.add` to carry overrides**

In `frontend/src/hooks/useSavedRecipes.js`, update `add`:
```js
  const add = useCallback(async (recipe, overrides) => {
    const { recipe: saved } = await createSavedRecipe(recipe, overrides)
    setList((prev) => [...prev, saved])
    return saved
  }, [])
```

- [ ] **Step 5: Wire RecipeDetailPage**

In `frontend/src/pages/RecipeDetailPage.jsx`:
- Add imports:
```js
import { useIngredientOverrides } from '../hooks/useIngredientOverrides.js'
import { updateOverrides } from '../api/savedRecipes.js'
```
- After `const savedRow = findSaved(recipe)`, seed overrides from the saved row:
```js
  const { overrides, replace, setAmount, exclude, unexclude } = useIngredientOverrides(savedRow?.overrides || [])
  const actions = { replace, setAmount, exclude, unexclude }
```
- Update the favorite toggle to persist overrides on save:
```js
  const handleToggleFav = () => {
    if (savedRow) {
      remove(savedRow.id)
    } else {
      add(recipe, overrides)
    }
  }
```
- Add a persist-on-close handler for already-saved recipes:
```js
  const handleEditDone = () => {
    if (savedRow) updateOverrides(savedRow.id, overrides).catch(() => {})
  }
```
- Pass the new props to NutritionCard in the carousel slides:
```js
          <NutritionCard recipe={recipe} overrides={overrides} actions={actions} onEditDone={handleEditDone} />,
```

- [ ] **Step 6: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/components/cards/__tests__/NutritionCard.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/cards/NutritionCard.jsx frontend/src/components/cards/NutritionCard.css frontend/src/hooks/useSavedRecipes.js frontend/src/pages/RecipeDetailPage.jsx frontend/src/components/cards/__tests__/NutritionCard.test.jsx
git commit -m "feat: wire ingredient editing into NutritionCard and RecipeDetailPage"
```

---

## Task 10: Full suite + manual verification

- [ ] **Step 1: Run the full backend suite**

Run (from `backend/`): `node --test`
Expected: all tests PASS.

- [ ] **Step 2: Run the full frontend suite + lint**

Run (from `frontend/`): `npm run test` then `npm run lint`
Expected: all tests PASS; no new lint errors.

- [ ] **Step 3: Manual end-to-end check (mobile width)**

Start backend (`node server.js`) and frontend (`npm run dev`), open DevTools device toolbar at ~390px. Scrape a recipe → open Nutrition → **Edit ingredients**:
- Replace a bad match (search, pick) → totals recompute.
- Exclude a line → it strikes through, totals drop.
- Close, tap the heart to save → reopen the saved recipe from the Saved page → overrides rehydrate and nutrition reflects them.
- Edit an already-saved recipe, close the modal → reopen → changes persisted.

- [ ] **Step 4: Final commit (if any docs/cleanup)**

```bash
git add -A
git commit -m "chore: ingredient overrides verification pass"
```

---

## Self-Review Notes (for the implementer)

- **add-missing is intentionally out of scope** — every override anchors to an existing ingredient index.
- **`items[i]` aligns with `ingredients[i]`** — `combineNutrition` pushes exactly one item per line in order; the modal relies on this.
- **Two distinct "save" paths exist** — the heart toggle (`useSavedRecipes.add` → `POST /saved-recipes`, per-user) carries overrides; `handleSaveToDb`/`saveRecipe` (`/save-recipe`, the global CSV catalog) is unrelated and untouched.
- **Prisma `$transaction([...])`** receives unawaited query promises in production; the Task-5 test stubs return plain values, which is fine for assertion.
