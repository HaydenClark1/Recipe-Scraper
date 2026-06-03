# Fully Editable Recipe & Per-Ingredient Nutrition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a recipe fully editable — edit/add/delete/drag-reorder ingredients and instructions, edit each ingredient's matched food (search), scale, or manual nutrition values — with live recompute and per-user persistence.

**Architecture:** The recipe becomes a working JSON **document** in frontend state: each ingredient is `{ id, text, nutrition }`, each instruction `{ id, text }`. The backend stays the single source of scaling math (`combine.js` gains a `manual` override type); the frontend zips the document's embedded nutrition into the existing index-aligned `/get-nutrition` overrides per request. Persistence stores the rich ingredients as `ingredientsData` JSON on `SavedRecipe` (plain `ingredients`/`instructions` string columns derived for backward compatibility). This supersedes Project 2's index-keyed `IngredientOverride` table.

**Tech Stack:** Node/Express + Prisma (SQL Server) backend with `node --test`; React (Vite) + Capacitor frontend with Vitest + Testing Library; `@dnd-kit` for drag-reorder. Frontend components built with the `ui-ux-pro-max` skill and validated at phone widths (~360–414px).

**Spec:** `docs/superpowers/specs/2026-06-02-editable-recipe-design.md`

**Branch:** Continue on `feat/ingredient-overrides` (this builds on Project 2 and reuses its `/search-foods`, `combine.js`, and search/amount UI; it removes Project 2's `IngredientOverride` persistence and the `EditIngredientsModal`/`useIngredientOverrides` it added).

**Canonical override wire shape** (`/get-nutrition`; reused from Project 2 + `manual`):
```js
{ index, type: 'replace' | 'exclude' | 'amount' | 'manual',
  foodName?, foodDescription?, fdcId?,        // replace
  quantity?, unit?,                            // amount
  calories?, fat?, carbs?, protein? }          // manual
```

**Document & per-ingredient nutrition shape** (frontend + persisted as `ingredientsData`):
```js
// ingredient item
{ id, text, nutrition: null | {
    excluded?: true,
    manual?:  { calories, fat, carbs, protein },
    food?:    { foodName, foodDescription, fdcId? },
    amount?:  { quantity, unit },
} }
// instruction item (id is for reorder keys only; persisted as a plain string array)
{ id, text }
```
Resolution precedence per line: `excluded` → `manual` (final, unscaled) → food (`food` override or auto-search) scaled by `amount` (override or parsed amount).

---

## File Structure

**Backend**
- Modify `backend/prisma/schema.prisma` — add `ingredientsData`; remove `IngredientOverride` + relation.
- Modify `backend/nutrition/combine.js` — add `manual` override type.
- Modify `backend/recipes/savedRecipeHandlers.js` — rich document (de)serialization, create-with-document, `makeUpdateHandler`; remove override helpers/handler.
- Modify `backend/recipes/savedRecipeRoutes.js` — add `PUT /:id`; remove `PUT /:id/overrides`.
- Tests: `backend/nutrition/__tests__/combine.test.js`, `backend/recipes/__tests__/savedRecipeHandlers.test.js`.

**Frontend**
- Modify `frontend/src/api/savedRecipes.js` — `createSavedRecipe(recipe)`, `updateRecipe(id, recipe)`; remove `updateOverrides`.
- Create `frontend/src/lib/recipeDocument.js` — pure document helpers.
- Create `frontend/src/hooks/useRecipeEditor.js` — working document state + derived values.
- Create `frontend/src/components/IngredientsEditor.jsx` (+ `.css`) — ingredient + per-line nutrition editor (supersedes `EditIngredientsModal`).
- Create `frontend/src/components/InstructionsEditor.jsx` (+ `.css`) — instruction editor.
- Modify `frontend/src/components/cards/IngredientsCard.jsx`, `InstructionsCard.jsx`, `cards/NutritionCard.jsx` — add edit entry points; render from the document.
- Modify `frontend/src/hooks/useSavedRecipes.js` — `add(recipe)` (drop overrides param).
- Modify `frontend/src/pages/RecipeDetailPage.jsx` — own the document; persistence.
- Remove `frontend/src/components/EditIngredientsModal.jsx` (+ `.css` + test) and `frontend/src/hooks/useIngredientOverrides.js` (+ test).
- Tests under the matching `__tests__` directories.

---

## Task 1: Schema — add `ingredientsData`, remove `IngredientOverride`

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Remove the `overrides` relation from `SavedRecipe` and add `ingredientsData`**

In `model SavedRecipe`, replace the `overrides IngredientOverride[]` line (added in Project 2) with:
```prisma
  ingredientsData String?  @db.NVarChar(Max)
```
If both the `overrides` relation line and `createdAt` are present, the block tail should read:
```prisma
  sourceUrl       String?  @db.NVarChar(1000)
  createdAt       DateTime @default(now())
  ingredientsData String?  @db.NVarChar(Max)

  @@index([userId])
```

- [ ] **Step 2: Delete the `IngredientOverride` model**

Remove the entire `model IngredientOverride { ... }` block from the file.

- [ ] **Step 3: Push the schema and regenerate the client**

Run (from `backend/`): `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema" (Prisma will drop the now-unused `IngredientOverride` table) and "Generated Prisma Client".

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: replace IngredientOverride with ingredientsData on SavedRecipe"
```

---

## Task 2: `manual` override in `combine.js`

**Files:**
- Modify: `backend/nutrition/combine.js`
- Test: `backend/nutrition/__tests__/combine.test.js`

- [ ] **Step 1: Write failing tests**

Append to `backend/nutrition/__tests__/combine.test.js`:
```js
test('manual override uses final unscaled values and skips searching', async () => {
  let searched = false
  const searchFood = async () => { searched = true; return null }
  const overrides = [{ index: 0, type: 'manual', calories: 250, fat: 10, carbs: 5, protein: 30 }]
  const { items, totals } = await combineNutrition(['2 chicken breasts'], null, { searchFood, overrides })
  assert.strictEqual(searched, false)
  assert.strictEqual(items[0].overridden, true)
  assert.strictEqual(items[0].matched, true)
  assert.strictEqual(items[0].calories, 250)
  assert.strictEqual(items[0].protein, 30)
  assert.strictEqual(totals.calories, 250)
  assert.strictEqual(totals.protein, 30)
})

test('manual override treats missing macros as 0', async () => {
  const searchFood = async () => null
  const overrides = [{ index: 0, type: 'manual', calories: 100 }]
  const { items } = await combineNutrition(['1 thing'], null, { searchFood, overrides })
  assert.strictEqual(items[0].calories, 100)
  assert.strictEqual(items[0].fat, 0)
  assert.strictEqual(items[0].carbs, 0)
  assert.strictEqual(items[0].protein, 0)
})

test('exclude takes precedence over manual', async () => {
  const searchFood = async () => null
  const overrides = [
    { index: 0, type: 'manual', calories: 999 },
    { index: 0, type: 'exclude' },
  ]
  const { items, totals } = await combineNutrition(['1 thing'], null, { searchFood, overrides })
  assert.strictEqual(items[0].excluded, true)
  assert.strictEqual(items[0].calories, 0)
  assert.strictEqual(totals.calories, 0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`): `node --test nutrition/__tests__/combine.test.js`
Expected: FAIL (manual not handled; manual item has 0 calories).

- [ ] **Step 3: Implement the `manual` branch**

In `backend/nutrition/combine.js`, inside the `for` loop, immediately **after** the `if (ov.exclude) { ... continue }` block and **before** the `let match = null` line, insert:
```js
    if (ov.manual) {
      const m = ov.manual
      const item = {
        name,
        matched: true,
        excluded: false,
        overridden: true,
        matchedName: 'Manual entry',
        matchedBasis: null,
        scaleFactor: null,
        grams: null,
        calories: Math.round(m.calories || 0),
        fat: round(m.fat || 0, 1),
        carbs: round(m.carbs || 0, 1),
        protein: round(m.protein || 0, 1),
      }
      items.push(item)
      totals.calories += item.calories
      totals.fat += item.fat
      totals.carbs += item.carbs
      totals.protein += item.protein
      continue
    }
```
The override map already collects per-type entries, so `ov.manual` is the manual override object (with `calories`/`fat`/`carbs`/`protein`). No other changes needed — `exclude` already `continue`s before this block, giving it precedence.

- [ ] **Step 4: Run tests to verify they pass**

Run (from `backend/`): `node --test nutrition/__tests__/combine.test.js`
Expected: PASS (all prior + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/combine.js backend/nutrition/__tests__/combine.test.js
git commit -m "feat: add manual nutrition override to combineNutrition"
```

---

## Task 3: Rich document persistence in saved-recipe handlers

**Files:**
- Modify: `backend/recipes/savedRecipeHandlers.js`
- Test: `backend/recipes/__tests__/savedRecipeHandlers.test.js`

- [ ] **Step 1: Remove Project 2 override-specific tests**

In `backend/recipes/__tests__/savedRecipeHandlers.test.js`, delete these tests (added in Project 2; the symbols they use are being removed): `deserializeRecipe maps override rows to wire shape`, `create persists nested override rows`, `replaceOverrides 404 when recipe not owned`, `replaceOverrides deletes then recreates the set`. Also remove the `const { makeReplaceOverridesHandler } = require('../savedRecipeHandlers')` line if present.

- [ ] **Step 2: Write failing tests for the new document behavior**

Append to `backend/recipes/__tests__/savedRecipeHandlers.test.js` (keep the existing `mockRes` helper and `require` of `serializeRecipe`/`deserializeRecipe`/`makeCreateHandler` at the top of the file; add `makeUpdateHandler` to that require):
```js
const { makeUpdateHandler } = require('../savedRecipeHandlers')

test('serializeRecipe stores ingredientsData and derives the flat ingredients column', () => {
  const data = serializeRecipe({
    title: 'T',
    ingredientsData: [
      { id: 'a', text: '2 eggs', nutrition: { manual: { calories: 140 } } },
      { id: 'b', text: 'salt', nutrition: { excluded: true } },
    ],
    instructions: ['mix', 'cook'],
  }, 7)
  assert.deepStrictEqual(JSON.parse(data.ingredients), ['2 eggs', 'salt'])
  assert.deepStrictEqual(JSON.parse(data.instructions), ['mix', 'cook'])
  const rich = JSON.parse(data.ingredientsData)
  assert.strictEqual(rich[0].text, '2 eggs')
  assert.deepStrictEqual(rich[0].nutrition, { manual: { calories: 140 } })
  assert.strictEqual(data.userId, 7)
})

test('serializeRecipe accepts plain string ingredients (wraps them)', () => {
  const data = serializeRecipe({ title: 'T', ingredients: ['a', 'b'], instructions: [] }, 1)
  const rich = JSON.parse(data.ingredientsData)
  assert.strictEqual(rich.length, 2)
  assert.strictEqual(rich[0].text, 'a')
  assert.strictEqual(rich[0].nutrition, null)
  assert.ok(typeof rich[0].id === 'string' && rich[0].id.length > 0)
})

test('deserializeRecipe parses ingredientsData into rich + flat ingredients', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["2 eggs","salt"]',
    instructions: '["mix"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    ingredientsData: '[{"id":"a","text":"2 eggs","nutrition":{"manual":{"calories":140}}},{"id":"b","text":"salt","nutrition":{"excluded":true}}]',
  })
  assert.deepStrictEqual(r.ingredients, ['2 eggs', 'salt'])
  assert.strictEqual(r.ingredientsData[0].id, 'a')
  assert.deepStrictEqual(r.ingredientsData[1].nutrition, { excluded: true })
  assert.deepStrictEqual(r.instructions, ['mix'])
})

test('deserializeRecipe falls back to plain ingredients when ingredientsData is null (legacy)', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["2 eggs","salt"]',
    instructions: '["mix"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    ingredientsData: null,
  })
  assert.deepStrictEqual(r.ingredients, ['2 eggs', 'salt'])
  assert.strictEqual(r.ingredientsData.length, 2)
  assert.strictEqual(r.ingredientsData[0].text, '2 eggs')
  assert.strictEqual(r.ingredientsData[0].nutrition, null)
})

test('update replaces editable fields, scoped to the owner', async () => {
  let updateArg = null
  const prisma = {
    savedRecipe: {
      findFirst: async ({ where }) => (where.id === 5 && where.userId === 9 ? { id: 5 } : null),
      update: async (arg) => { updateArg = arg; return { id: 5, ...arg.data, ingredients: arg.data.ingredients, instructions: arg.data.instructions } },
    },
  }
  const res = mockRes()
  const req = { userId: 9, params: { id: '5' }, body: { recipe: { title: 'New', ingredientsData: [{ id: 'a', text: 'x', nutrition: null }], instructions: ['s1'] } } }
  await makeUpdateHandler(prisma)(req, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(updateArg.where.id, 5)
  assert.deepStrictEqual(JSON.parse(updateArg.data.ingredients), ['x'])
  assert.strictEqual(JSON.parse(updateArg.data.ingredientsData)[0].text, 'x')
})

test('update 404 when recipe not owned', async () => {
  const prisma = { savedRecipe: { findFirst: async () => null } }
  const res = mockRes()
  await makeUpdateHandler(prisma)({ userId: 9, params: { id: '5' }, body: { recipe: { title: 'X' } } }, res)
  assert.strictEqual(res.statusCode, 404)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run (from `backend/`): `node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: FAIL (`makeUpdateHandler is not a function`; serialize/deserialize don't handle `ingredientsData`).

- [ ] **Step 4: Implement document (de)serialization, create, update; remove override code**

Open `backend/recipes/savedRecipeHandlers.js`. Remove the Project 2 helpers `toOverrideRow`, `fromOverrideRow`, and the `makeReplaceOverridesHandler` function entirely. Then:

Add a `crypto` import at the top:
```js
const crypto = require('crypto')
```

Add these helpers near the top:
```js
function newId() {
  return crypto.randomUUID()
}

// Accept rich items ([{id,text,nutrition}]) or plain strings; always return rich.
function normalizeIngredientItems(input) {
  const arr = Array.isArray(input) ? input : []
  return arr.map((el) =>
    typeof el === 'string'
      ? { id: newId(), text: el, nutrition: null }
      : { id: el.id || newId(), text: el.text || '', nutrition: el.nutrition ?? null }
  )
}
```

Replace `serializeRecipe` with:
```js
function serializeRecipe(recipe, userId) {
  const rich = normalizeIngredientItems(recipe.ingredientsData ?? recipe.ingredients)
  return {
    userId,
    title: recipe.title || '',
    image: recipe.image ?? null,
    ingredients: JSON.stringify(rich.map((r) => r.text)),
    instructions: JSON.stringify(recipe.instructions || []),
    servings: recipe.servings ?? null,
    prepTime: recipe.prepTime ?? null,
    totalTime: recipe.totalTime ?? null,
    category: JSON.stringify(recipe.category || []),
    cuisine: JSON.stringify(recipe.cuisine || []),
    sourceUrl: recipe.sourceUrl ?? null,
    ingredientsData: JSON.stringify(rich),
  }
}
```

Replace `deserializeRecipe` with:
```js
function deserializeRecipe(row) {
  let rich
  if (row.ingredientsData) {
    rich = JSON.parse(row.ingredientsData)
  } else {
    rich = JSON.parse(row.ingredients || '[]').map((text) => ({ id: newId(), text, nutrition: null }))
  }
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients: rich.map((r) => r.text),
    ingredientsData: rich,
    instructions: JSON.parse(row.instructions || '[]'),
    servings: row.servings,
    prepTime: row.prepTime,
    totalTime: row.totalTime,
    category: JSON.parse(row.category || '[]'),
    cuisine: JSON.parse(row.cuisine || '[]'),
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
  }
}
```

Replace `makeListHandler` and `makeCreateHandler` with (note: no `include`, no override rows):
```js
function makeListHandler(prisma) {
  return async function list(req, res) {
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    return res.status(200).json({ recipes: rows.map(deserializeRecipe) })
  }
}

function makeCreateHandler(prisma) {
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const row = await prisma.savedRecipe.create({ data: serializeRecipe(recipe, req.userId) })
    return res.status(201).json({ recipe: deserializeRecipe(row) })
  }
}
```

Add the update handler:
```js
function makeUpdateHandler(prisma) {
  return async function update(req, res) {
    const id = Number(req.params.id)
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const owned = await prisma.savedRecipe.findFirst({ where: { id, userId: req.userId } })
    if (!owned) return res.status(404).json({ error: 'Recipe not found' })
    const data = serializeRecipe(recipe, req.userId)
    delete data.userId // never reassign ownership on update
    const row = await prisma.savedRecipe.update({ where: { id }, data })
    return res.status(200).json({ recipe: deserializeRecipe(row) })
  }
}
```

Update `module.exports` to:
```js
module.exports = {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler,
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run (from `backend/`): `node --test recipes/__tests__/savedRecipeHandlers.test.js`
Expected: PASS (existing list/create/delete/serialize tests + the new document tests).

- [ ] **Step 6: Commit**

```bash
git add backend/recipes/savedRecipeHandlers.js backend/recipes/__tests__/savedRecipeHandlers.test.js
git commit -m "feat: persist editable recipe document; add update handler"
```

---

## Task 4: Wire `PUT /:id`, remove `PUT /:id/overrides`

**Files:**
- Modify: `backend/recipes/savedRecipeRoutes.js`

- [ ] **Step 1: Update the router**

Replace the entire contents of `backend/recipes/savedRecipeRoutes.js` with:
```js
const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.put('/:id', makeUpdateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
```

- [ ] **Step 2: Run the full backend suite**

Run (from `backend/`): `node --test`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/recipes/savedRecipeRoutes.js
git commit -m "feat: add PUT /saved-recipes/:id, drop /:id/overrides route"
```

---

## Task 5: Frontend API helpers

**Files:**
- Modify: `frontend/src/api/savedRecipes.js`
- Test: `frontend/src/api/__tests__/savedRecipes.test.js` (create if absent)

- [ ] **Step 1: Write a failing test**

Create/extend `frontend/src/api/__tests__/savedRecipes.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSavedRecipe, updateRecipe } from '../savedRecipes.js'

describe('savedRecipes api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ recipe: {} }) })
  })
  it('createSavedRecipe posts the recipe document', async () => {
    await createSavedRecipe({ title: 'T', ingredientsData: [{ id: 'a', text: 'x', nutrition: null }], instructions: ['s'] })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/saved-recipes')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body).recipe.ingredientsData[0].text).toBe('x')
  })
  it('updateRecipe PUTs to the recipe id', async () => {
    await updateRecipe(5, { title: 'T', ingredientsData: [], instructions: [] })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toContain('/saved-recipes/5')
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body).recipe.title).toBe('T')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/api/__tests__/savedRecipes.test.js`
Expected: FAIL (`updateRecipe` not exported; `createSavedRecipe` arity).

- [ ] **Step 3: Update `savedRecipes.js`**

Replace the entire contents of `frontend/src/api/savedRecipes.js` with:
```js
import { apiClient, apiGet, apiDelete, apiPut } from './client.js'

export const listSavedRecipes = () => apiGet('/saved-recipes')
export const createSavedRecipe = (recipe) => apiClient('/saved-recipes', { recipe })
export const deleteSavedRecipe = (id) => apiDelete(`/saved-recipes/${id}`)
export const updateRecipe = (id, recipe) => apiPut(`/saved-recipes/${id}`, { recipe })
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/api/__tests__/savedRecipes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/savedRecipes.js frontend/src/api/__tests__/savedRecipes.test.js
git commit -m "feat: createSavedRecipe(document) and updateRecipe(id, document)"
```

---

## Task 6: `recipeDocument.js` pure helpers

**Files:**
- Create: `frontend/src/lib/recipeDocument.js`
- Test: `frontend/src/lib/__tests__/recipeDocument.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/recipeDocument.test.js`:
```js
import { describe, it, expect } from 'vitest'
import {
  buildIngredientItems, buildInstructionItems,
  deriveIngredientTexts, deriveInstructionTexts, deriveOverrides, moveById,
} from '../recipeDocument.js'

describe('recipeDocument', () => {
  it('buildIngredientItems wraps plain strings with ids and null nutrition', () => {
    const items = buildIngredientItems(['2 eggs', 'salt'])
    expect(items).toHaveLength(2)
    expect(items[0].text).toBe('2 eggs')
    expect(items[0].nutrition).toBeNull()
    expect(typeof items[0].id).toBe('string')
    expect(items[0].id).not.toBe(items[1].id)
  })

  it('buildIngredientItems passes rich items through (keeping ids + nutrition)', () => {
    const items = buildIngredientItems([{ id: 'a', text: 'x', nutrition: { excluded: true } }])
    expect(items[0]).toEqual({ id: 'a', text: 'x', nutrition: { excluded: true } })
  })

  it('buildInstructionItems wraps strings with ids', () => {
    const items = buildInstructionItems(['mix', 'bake'])
    expect(items.map((i) => i.text)).toEqual(['mix', 'bake'])
    expect(typeof items[0].id).toBe('string')
  })

  it('deriveIngredientTexts / deriveInstructionTexts extract text in order', () => {
    expect(deriveIngredientTexts([{ id: '1', text: 'a' }, { id: '2', text: 'b' }])).toEqual(['a', 'b'])
    expect(deriveInstructionTexts([{ id: '1', text: 'm' }])).toEqual(['m'])
  })

  it('deriveOverrides maps each nutrition type to indexed wire entries', () => {
    const items = [
      { id: '1', text: 'a', nutrition: { excluded: true } },
      { id: '2', text: 'b', nutrition: { manual: { calories: 100, fat: 1, carbs: 2, protein: 3 } } },
      { id: '3', text: 'c', nutrition: { food: { foodName: 'Beef', foodDescription: 'd', fdcId: 9 }, amount: { quantity: 2, unit: 'cup' } } },
      { id: '4', text: 'd', nutrition: null },
    ]
    expect(deriveOverrides(items)).toEqual([
      { index: 0, type: 'exclude' },
      { index: 1, type: 'manual', calories: 100, fat: 1, carbs: 2, protein: 3 },
      { index: 2, type: 'replace', foodName: 'Beef', foodDescription: 'd', fdcId: 9 },
      { index: 2, type: 'amount', quantity: 2, unit: 'cup' },
    ])
  })

  it('moveById moves an item to the target position', () => {
    const arr = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveById(arr, 'a', 'c').map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(moveById(arr, 'c', 'a').map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(moveById(arr, 'a', 'a')).toBe(arr)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/lib/__tests__/recipeDocument.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/lib/recipeDocument.js`:
```js
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export function buildIngredientItems(ingredients) {
  const arr = Array.isArray(ingredients) ? ingredients : []
  return arr.map((el) =>
    typeof el === 'string'
      ? { id: newId(), text: el, nutrition: null }
      : { id: el.id || newId(), text: el.text || '', nutrition: el.nutrition ?? null }
  )
}

export function buildInstructionItems(instructions) {
  const arr = Array.isArray(instructions) ? instructions : []
  return arr.map((el) =>
    typeof el === 'string' ? { id: newId(), text: el } : { id: el.id || newId(), text: el.text || '' }
  )
}

export function deriveIngredientTexts(items) {
  return items.map((i) => i.text)
}

export function deriveInstructionTexts(items) {
  return items.map((i) => i.text)
}

// Zip embedded per-line nutrition into the index-aligned /get-nutrition wire shape.
export function deriveOverrides(items) {
  const out = []
  items.forEach((item, index) => {
    const n = item.nutrition
    if (!n) return
    if (n.excluded) { out.push({ index, type: 'exclude' }); return }
    if (n.manual) {
      out.push({
        index, type: 'manual',
        calories: n.manual.calories ?? 0,
        fat: n.manual.fat ?? 0,
        carbs: n.manual.carbs ?? 0,
        protein: n.manual.protein ?? 0,
      })
      return
    }
    if (n.food) {
      const e = { index, type: 'replace', foodName: n.food.foodName, foodDescription: n.food.foodDescription }
      if (n.food.fdcId != null) e.fdcId = n.food.fdcId
      out.push(e)
    }
    if (n.amount) {
      out.push({ index, type: 'amount', quantity: n.amount.quantity, unit: n.amount.unit })
    }
  })
  return out
}

export function moveById(arr, fromId, toId) {
  const from = arr.findIndex((x) => x.id === fromId)
  const to = arr.findIndex((x) => x.id === toId)
  if (from === -1 || to === -1 || from === to) return arr
  const copy = arr.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/lib/__tests__/recipeDocument.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/recipeDocument.js frontend/src/lib/__tests__/recipeDocument.test.js
git commit -m "feat: pure recipe-document helpers"
```

---

## Task 7: `useRecipeEditor` hook

**Files:**
- Create: `frontend/src/hooks/useRecipeEditor.js`
- Test: `frontend/src/hooks/__tests__/useRecipeEditor.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/__tests__/useRecipeEditor.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecipeEditor } from '../useRecipeEditor.js'

const baseRecipe = {
  title: 'Soup', servings: '2',
  ingredients: ['2 eggs', 'salt'],
  instructions: ['mix', 'cook'],
}

describe('useRecipeEditor', () => {
  it('seeds ingredient and instruction items and derives texts', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    expect(result.current.ingredientTexts).toEqual(['2 eggs', 'salt'])
    expect(result.current.instructionTexts).toEqual(['mix', 'cook'])
    expect(result.current.overrides).toEqual([])
  })

  it('edits, adds, and deletes ingredient text', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const firstId = result.current.ingredients[0].id
    act(() => result.current.editIngredientText(firstId, '3 eggs'))
    expect(result.current.ingredientTexts[0]).toBe('3 eggs')
    act(() => result.current.addIngredient())
    expect(result.current.ingredients).toHaveLength(3)
    const lastId = result.current.ingredients[2].id
    act(() => result.current.deleteIngredient(lastId))
    expect(result.current.ingredients).toHaveLength(2)
  })

  it('reorders ingredients by id', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [a, b] = result.current.ingredients.map((i) => i.id)
    act(() => result.current.reorderIngredients(a, b))
    expect(result.current.ingredientTexts).toEqual(['salt', '2 eggs'])
  })

  it('applies nutrition actions and derives overrides; nutrition follows the line on reorder', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [a, b] = result.current.ingredients.map((i) => i.id)
    act(() => result.current.setFood(a, { food_name: 'Egg', food_description: 'd', fdcId: 1 }))
    act(() => result.current.setAmount(a, 3, 'unit'))
    act(() => result.current.setManual(b, { calories: 0, fat: 0, carbs: 0, protein: 0 }))
    act(() => result.current.exclude(b)) // exclude replaces manual for the same line
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'replace', foodName: 'Egg', foodDescription: 'd', fdcId: 1 },
      { index: 0, type: 'amount', quantity: 3, unit: 'unit' },
      { index: 1, type: 'exclude' },
    ])
    act(() => result.current.reorderIngredients(a, b)) // move 'a' after 'b'
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'exclude' },
      { index: 1, type: 'replace', foodName: 'Egg', foodDescription: 'd', fdcId: 1 },
      { index: 1, type: 'amount', quantity: 3, unit: 'unit' },
    ])
  })

  it('setManual clears a prior exclude on the same line and vice versa', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const a = result.current.ingredients[0].id
    act(() => result.current.exclude(a))
    act(() => result.current.setManual(a, { calories: 50 }))
    expect(result.current.ingredients[0].nutrition).toEqual({ manual: { calories: 50, fat: 0, carbs: 0, protein: 0 } })
  })

  it('edits, adds, deletes, reorders instructions', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [m, c] = result.current.instructions.map((i) => i.id)
    act(() => result.current.editInstruction(m, 'stir'))
    expect(result.current.instructionTexts[0]).toBe('stir')
    act(() => result.current.addInstruction())
    expect(result.current.instructions).toHaveLength(3)
    act(() => result.current.reorderInstructions(m, c))
    expect(result.current.instructionTexts.slice(0, 2)).toEqual(['cook', 'stir'])
    const lastId = result.current.instructions[2].id
    act(() => result.current.deleteInstruction(lastId))
    expect(result.current.instructions).toHaveLength(2)
  })

  it('toPayload merges base fields with the current document', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const payload = result.current.toPayload()
    expect(payload.title).toBe('Soup')
    expect(payload.instructions).toEqual(['mix', 'cook'])
    expect(payload.ingredientsData.map((i) => i.text)).toEqual(['2 eggs', 'salt'])
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/hooks/__tests__/useRecipeEditor.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useRecipeEditor.js`:
```js
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  buildIngredientItems, buildInstructionItems,
  deriveIngredientTexts, deriveInstructionTexts, deriveOverrides, moveById, newId,
} from '../lib/recipeDocument.js'

function recipeKey(recipe) {
  return recipe ? (recipe.sourceUrl || recipe.title || '') : ''
}

export function useRecipeEditor(recipe) {
  const seed = recipe || {}
  const [ingredients, setIngredients] = useState(() =>
    buildIngredientItems(seed.ingredientsData ?? seed.ingredients))
  const [instructions, setInstructions] = useState(() =>
    buildInstructionItems(seed.instructions))

  // Re-seed when navigating to a different recipe (same mounted page).
  const keyRef = useRef(recipeKey(recipe))
  useEffect(() => {
    const k = recipeKey(recipe)
    if (k !== keyRef.current) {
      keyRef.current = k
      setIngredients(buildIngredientItems(recipe.ingredientsData ?? recipe.ingredients))
      setInstructions(buildInstructionItems(recipe.instructions))
    }
  }, [recipe])

  const patchNutrition = useCallback((id, updater) => {
    setIngredients((prev) => prev.map((it) =>
      it.id === id ? { ...it, nutrition: updater(it.nutrition || {}) } : it))
  }, [])

  // Ingredient text/structure ops
  const editIngredientText = useCallback((id, text) => {
    setIngredients((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)))
  }, [])
  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, { id: newId(), text: '', nutrition: null }])
  }, [])
  const deleteIngredient = useCallback((id) => {
    setIngredients((prev) => prev.filter((it) => it.id !== id))
  }, [])
  const reorderIngredients = useCallback((fromId, toId) => {
    setIngredients((prev) => moveById(prev, fromId, toId))
  }, [])

  // Per-line nutrition ops (each mode is mutually exclusive at the top level)
  const setFood = useCallback((id, food) => {
    patchNutrition(id, (n) => {
      const next = { ...n }
      delete next.excluded
      delete next.manual
      next.food = { foodName: food.food_name, foodDescription: food.food_description }
      if (food.fdcId != null) next.food.fdcId = food.fdcId
      return next
    })
  }, [patchNutrition])
  const setAmount = useCallback((id, quantity, unit) => {
    patchNutrition(id, (n) => {
      const next = { ...n }
      delete next.excluded
      delete next.manual
      next.amount = { quantity, unit }
      return next
    })
  }, [patchNutrition])
  const setManual = useCallback((id, macros) => {
    patchNutrition(id, () => ({
      manual: {
        calories: macros.calories ?? 0,
        fat: macros.fat ?? 0,
        carbs: macros.carbs ?? 0,
        protein: macros.protein ?? 0,
      },
    }))
  }, [patchNutrition])
  const exclude = useCallback((id) => {
    patchNutrition(id, () => ({ excluded: true }))
  }, [patchNutrition])
  const clearNutrition = useCallback((id) => {
    setIngredients((prev) => prev.map((it) => (it.id === id ? { ...it, nutrition: null } : it)))
  }, [])

  // Instruction ops
  const editInstruction = useCallback((id, text) => {
    setInstructions((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)))
  }, [])
  const addInstruction = useCallback(() => {
    setInstructions((prev) => [...prev, { id: newId(), text: '' }])
  }, [])
  const deleteInstruction = useCallback((id) => {
    setInstructions((prev) => prev.filter((it) => it.id !== id))
  }, [])
  const reorderInstructions = useCallback((fromId, toId) => {
    setInstructions((prev) => moveById(prev, fromId, toId))
  }, [])

  const ingredientTexts = useMemo(() => deriveIngredientTexts(ingredients), [ingredients])
  const instructionTexts = useMemo(() => deriveInstructionTexts(instructions), [instructions])
  const overrides = useMemo(() => deriveOverrides(ingredients), [ingredients])

  const toPayload = useCallback(() => ({
    ...seed,
    ingredients: ingredientTexts,
    ingredientsData: ingredients,
    instructions: instructionTexts,
  }), [seed, ingredients, ingredientTexts, instructionTexts])

  return {
    ingredients, instructions,
    ingredientTexts, instructionTexts, overrides,
    editIngredientText, addIngredient, deleteIngredient, reorderIngredients,
    setFood, setAmount, setManual, exclude, clearNutrition,
    editInstruction, addInstruction, deleteInstruction, reorderInstructions,
    toPayload,
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/hooks/__tests__/useRecipeEditor.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useRecipeEditor.js frontend/src/hooks/__tests__/useRecipeEditor.test.js
git commit -m "feat: useRecipeEditor working-document hook"
```

---

## Task 8: IngredientsEditor component (+ install `@dnd-kit`)

**Files:**
- Modify: `frontend/package.json` (add deps)
- Create: `frontend/src/components/IngredientsEditor.jsx`
- Create: `frontend/src/components/IngredientsEditor.css`
- Test: `frontend/src/components/__tests__/IngredientsEditor.test.jsx`

> **Build the UI with the `ui-ux-pro-max` skill** — mobile-first full-height sheet (~360–414px), ≥44px touch targets, warm food-app palette (primary `#DC2626`, surfaces `#FFF7F7`, text `#450A0A`), visible focus rings, `touch-action: manipulation`, `overscroll-behavior: contain`. The code below is the functional baseline and the prop contract; refine markup/CSS via the skill without changing the contract.

- [ ] **Step 1: Install drag-and-drop dependencies**

Run (from `frontend/`): `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: packages added to `package.json` dependencies.

- [ ] **Step 2: Write failing test**

Create `frontend/src/components/__tests__/IngredientsEditor.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IngredientsEditor } from '../IngredientsEditor.jsx'

vi.mock('../../api/foods.js', () => ({
  searchFoods: vi.fn().mockResolvedValue({ foods: [{ food_name: 'Egg, whole', food_description: 'Per 100g - Calories: 143kcal' }] }),
}))

function makeEditor(ingredients) {
  return {
    ingredients,
    editIngredientText: vi.fn(), addIngredient: vi.fn(), deleteIngredient: vi.fn(), reorderIngredients: vi.fn(),
    setFood: vi.fn(), setAmount: vi.fn(), setManual: vi.fn(), exclude: vi.fn(), clearNutrition: vi.fn(),
  }
}

const ingredients = [
  { id: 'a', text: '2 eggs', nutrition: null },
  { id: 'b', text: 'salt', nutrition: { excluded: true } },
]

describe('IngredientsEditor', () => {
  it('renders a text field per ingredient', () => {
    render(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('2 eggs')).toBeInTheDocument()
    expect(screen.getByDisplayValue('salt')).toBeInTheDocument()
  })

  it('editing a field calls editIngredientText with id', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('2 eggs'), { target: { value: '3 eggs' } })
    expect(editor.editIngredientText).toHaveBeenCalledWith('a', '3 eggs')
  })

  it('Add ingredient calls addIngredient', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    expect(editor.addIngredient).toHaveBeenCalled()
  })

  it('Delete calls deleteIngredient with id', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete ingredient/i })[0])
    expect(editor.deleteIngredient).toHaveBeenCalledWith('a')
  })

  it('Exclude calls exclude with id', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^exclude$/i })[0])
    expect(editor.exclude).toHaveBeenCalledWith('a')
  })

  it('replace flow searches and applies a picked food', async () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value: 'egg' } })
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => screen.getByText('Egg, whole'))
    fireEvent.click(screen.getByText('Egg, whole'))
    expect(editor.setFood).toHaveBeenCalledWith('a', expect.objectContaining({ food_name: 'Egg, whole' }))
  })

  it('manual flow applies typed macros', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /manual/i })[0])
    fireEvent.change(screen.getByLabelText(/calories/i), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText(/^fat$/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/^carbs$/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/^protein$/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /apply manual/i }))
    expect(editor.setManual).toHaveBeenCalledWith('a', { calories: 250, fat: 10, carbs: 5, protein: 30 })
  })

  it('amount flow applies quantity/unit', () => {
    const editor = makeEditor(ingredients)
    render(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '0.25' } })
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: 'cup' } })
    fireEvent.click(screen.getByRole('button', { name: /apply amount/i }))
    expect(editor.setAmount).toHaveBeenCalledWith('a', 0.25, 'cup')
  })
})
```

- [ ] **Step 3: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/components/__tests__/IngredientsEditor.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/IngredientsEditor.jsx`:
```jsx
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

function nutritionSummary(n) {
  if (!n) return 'auto match'
  if (n.excluded) return 'excluded'
  if (n.manual) return `manual · ${n.manual.calories} cal`
  const bits = []
  if (n.food) bits.push(n.food.foodName)
  if (n.amount) bits.push(`${n.amount.quantity} ${n.amount.unit}`)
  return bits.join(' · ') || 'auto match'
}

function Row({ item, editor }) {
  const [panel, setPanel] = useState(null) // 'replace' | 'amount' | 'manual' | null
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} className="ing-row">
      <div className="ing-row__top">
        <button className="ing-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
        <input className="ing-row__text" value={item.text} aria-label="Ingredient text"
          onChange={(e) => editor.editIngredientText(item.id, e.target.value)} />
        <button className="ing-btn ing-btn--danger" aria-label="Delete ingredient"
          onClick={() => editor.deleteIngredient(item.id)}>Delete</button>
      </div>
      <div className="ing-row__summary">{nutritionSummary(item.nutrition)}</div>
      <div className="ing-row__actions">
        <button className="ing-btn" onClick={() => setPanel(panel === 'replace' ? null : 'replace')}>Replace</button>
        <button className="ing-btn" onClick={() => setPanel(panel === 'amount' ? null : 'amount')}>Amount</button>
        <button className="ing-btn" onClick={() => setPanel(panel === 'manual' ? null : 'manual')}>Manual</button>
        <button className="ing-btn" onClick={() => editor.exclude(item.id)} aria-label="Exclude">Exclude</button>
        <button className="ing-btn" onClick={() => editor.clearNutrition(item.id)} aria-label="Reset nutrition">Reset</button>
      </div>
      {panel === 'replace' && <ReplacePanel initial={item.text} onPick={(f) => { editor.setFood(item.id, f); setPanel(null) }} />}
      {panel === 'amount' && <AmountPanel onApply={(q, u) => { editor.setAmount(item.id, q, u); setPanel(null) }} />}
      {panel === 'manual' && <ManualPanel onApply={(m) => { editor.setManual(item.id, m); setPanel(null) }} />}
    </li>
  )
}

export function IngredientsEditor({ editor, items, onClose }) {
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
            {items.map((item) => <Row key={item.id} item={item} editor={editor} />)}
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
```

Create `frontend/src/components/IngredientsEditor.css`:
```css
.ing-editor { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #fff; touch-action: manipulation; }
.ing-editor__header, .ing-editor__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #FCA5A5; font-weight: 600; color: #450A0A; background: #FFF7F7; }
.ing-editor__footer { border-top: 1px solid #FCA5A5; border-bottom: none; }
.ing-editor__list { flex: 1; overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: 0; list-style: none; }
.ing-row { padding: 12px 16px; border-bottom: 1px solid #f2f2f2; }
.ing-row__top { display: flex; align-items: center; gap: 8px; }
.ing-row__text { flex: 1; min-height: 44px; font-size: 16px; padding: 8px 12px; border: 1px solid #FCA5A5; border-radius: 10px; color: #450A0A; }
.ing-row__summary { font-size: 13px; color: #888; margin: 6px 0 8px; }
.ing-row__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.ing-handle { min-height: 44px; min-width: 44px; border: 1px solid #FCA5A5; border-radius: 10px; background: #FFF7F7; color: #DC2626; cursor: grab; touch-action: none; }
.ing-btn { min-height: 44px; min-width: 44px; padding: 8px 14px; border: 1px solid #FCA5A5; border-radius: 10px; background: #FFF7F7; color: #DC2626; font-size: 14px; cursor: pointer; transition: background-color 0.2s; }
.ing-btn:hover { background: #FEE2E2; }
.ing-btn:focus-visible { outline: 2px solid #DC2626; outline-offset: 2px; }
.ing-btn--danger { color: #991B1B; }
.ing-btn--add { flex: 1; }
.ing-btn--done { flex: 1; background: #DC2626; color: #fff; border: none; font-weight: 600; }
.ing-panel { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.ing-panel--row { flex-direction: row; flex-wrap: wrap; align-items: center; }
.ing-panel__search { display: flex; gap: 8px; }
.ing-panel__input { flex: 1; min-height: 44px; font-size: 16px; padding: 8px 12px; border: 1px solid #FCA5A5; border-radius: 10px; }
.ing-panel__qty { width: 80px; min-height: 44px; font-size: 16px; padding: 8px 10px; border: 1px solid #FCA5A5; border-radius: 10px; }
.ing-panel__unit { flex: 1; min-width: 120px; min-height: 44px; font-size: 16px; padding: 8px 10px; border: 1px solid #FCA5A5; border-radius: 10px; }
.ing-results { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow-y: auto; overscroll-behavior: contain; }
.ing-result { display: flex; flex-direction: column; width: 100%; text-align: left; gap: 2px; padding: 12px 8px; border: none; border-bottom: 1px solid #f2f2f2; background: none; cursor: pointer; }
.ing-result__name { font-size: 16px; color: #450A0A; }
.ing-result__basis { font-size: 12px; color: #888; }
.ing-note { color: #888; font-size: 13px; }
.ing-manual__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ing-manual__field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: #450A0A; }
.ing-manual__field input { min-height: 44px; font-size: 16px; padding: 8px 10px; border: 1px solid #FCA5A5; border-radius: 10px; }
```

- [ ] **Step 5: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/components/__tests__/IngredientsEditor.test.jsx`
Expected: PASS (all 8 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/IngredientsEditor.jsx frontend/src/components/IngredientsEditor.css frontend/src/components/__tests__/IngredientsEditor.test.jsx
git commit -m "feat: IngredientsEditor with drag-reorder and per-line nutrition"
```

---

## Task 9: InstructionsEditor component

**Files:**
- Create: `frontend/src/components/InstructionsEditor.jsx`
- Create: `frontend/src/components/InstructionsEditor.css`
- Test: `frontend/src/components/__tests__/InstructionsEditor.test.jsx`

> **Build the UI with the `ui-ux-pro-max` skill** — same mobile-first sheet, palette, and touch-target rules as Task 8.

- [ ] **Step 1: Write failing test**

Create `frontend/src/components/__tests__/InstructionsEditor.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstructionsEditor } from '../InstructionsEditor.jsx'

function makeEditor(instructions) {
  return {
    instructions,
    editInstruction: vi.fn(), addInstruction: vi.fn(), deleteInstruction: vi.fn(), reorderInstructions: vi.fn(),
  }
}
const steps = [{ id: 'm', text: 'mix' }, { id: 'c', text: 'cook' }]

describe('InstructionsEditor', () => {
  it('renders a field per step', () => {
    render(<InstructionsEditor editor={makeEditor(steps)} items={steps} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('mix')).toBeInTheDocument()
    expect(screen.getByDisplayValue('cook')).toBeInTheDocument()
  })
  it('editing calls editInstruction with id', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('mix'), { target: { value: 'stir' } })
    expect(editor.editInstruction).toHaveBeenCalledWith('m', 'stir')
  })
  it('Add step calls addInstruction', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add step/i }))
    expect(editor.addInstruction).toHaveBeenCalled()
  })
  it('Delete calls deleteInstruction with id', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete step/i })[0])
    expect(editor.deleteInstruction).toHaveBeenCalledWith('m')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/components/__tests__/InstructionsEditor.test.jsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/InstructionsEditor.jsx`:
```jsx
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import './InstructionsEditor.css'

function Row({ item, index, editor }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li ref={setNodeRef} style={style} className="ins-row">
      <button className="ins-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>⠿</button>
      <span className="ins-row__num">{index + 1}.</span>
      <textarea className="ins-row__text" value={item.text} aria-label="Instruction step" rows={2}
        onChange={(e) => editor.editInstruction(item.id, e.target.value)} />
      <button className="ins-btn ins-btn--danger" aria-label="Delete step"
        onClick={() => editor.deleteInstruction(item.id)}>Delete</button>
    </li>
  )
}

export function InstructionsEditor({ editor, items, onClose }) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) editor.reorderInstructions(active.id, over.id)
  }
  return (
    <div className="ins-editor" role="dialog" aria-label="Edit instructions">
      <header className="ins-editor__header">
        <span>Edit instructions</span>
        <button className="ins-editor__close" onClick={onClose} aria-label="Close">Close</button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ol className="ins-editor__list">
            {items.map((item, index) => <Row key={item.id} item={item} index={index} editor={editor} />)}
          </ol>
        </SortableContext>
      </DndContext>
      <footer className="ins-editor__footer">
        <button className="ins-btn ins-btn--add" onClick={editor.addInstruction} aria-label="Add step">+ Add step</button>
        <button className="ins-btn ins-btn--done" onClick={onClose} aria-label="Done editing instructions">Done</button>
      </footer>
    </div>
  )
}
```

Create `frontend/src/components/InstructionsEditor.css`:
```css
.ins-editor { position: fixed; inset: 0; z-index: 1000; display: flex; flex-direction: column; background: #fff; touch-action: manipulation; }
.ins-editor__header, .ins-editor__footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #FCA5A5; font-weight: 600; color: #450A0A; background: #FFF7F7; }
.ins-editor__footer { border-top: 1px solid #FCA5A5; border-bottom: none; }
.ins-editor__list { flex: 1; overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: 0; list-style: none; }
.ins-row { display: flex; align-items: flex-start; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f2f2f2; }
.ins-row__num { min-width: 20px; padding-top: 12px; color: #888; }
.ins-row__text { flex: 1; min-height: 44px; font-size: 16px; padding: 8px 12px; border: 1px solid #FCA5A5; border-radius: 10px; color: #450A0A; resize: vertical; }
.ins-handle { min-height: 44px; min-width: 44px; border: 1px solid #FCA5A5; border-radius: 10px; background: #FFF7F7; color: #DC2626; cursor: grab; touch-action: none; }
.ins-btn { min-height: 44px; min-width: 44px; padding: 8px 14px; border: 1px solid #FCA5A5; border-radius: 10px; background: #FFF7F7; color: #DC2626; font-size: 14px; cursor: pointer; transition: background-color 0.2s; }
.ins-btn:hover { background: #FEE2E2; }
.ins-btn:focus-visible { outline: 2px solid #DC2626; outline-offset: 2px; }
.ins-btn--danger { color: #991B1B; }
.ins-btn--add { flex: 1; }
.ins-btn--done { flex: 1; background: #DC2626; color: #fff; border: none; font-weight: 600; }
```

- [ ] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/components/__tests__/InstructionsEditor.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/InstructionsEditor.jsx frontend/src/components/InstructionsEditor.css frontend/src/components/__tests__/InstructionsEditor.test.jsx
git commit -m "feat: InstructionsEditor with drag-reorder"
```

---

## Task 10: Wire cards + RecipeDetailPage; remove superseded files

**Files:**
- Modify: `frontend/src/components/cards/IngredientsCard.jsx`
- Modify: `frontend/src/components/cards/InstructionsCard.jsx`
- Modify: `frontend/src/components/cards/NutritionCard.jsx`
- Modify: `frontend/src/hooks/useSavedRecipes.js`
- Modify: `frontend/src/pages/RecipeDetailPage.jsx`
- Remove: `frontend/src/components/EditIngredientsModal.jsx`, `frontend/src/components/EditIngredientsModal.css`, `frontend/src/components/__tests__/EditIngredientsModal.test.jsx`, `frontend/src/hooks/useIngredientOverrides.js`, `frontend/src/hooks/__tests__/useIngredientOverrides.test.js`
- Test: `frontend/src/pages/__tests__/RecipeDetailPage.test.jsx`

- [ ] **Step 1: Add an `onEdit` button to `IngredientsCard`**

Replace the contents of `frontend/src/components/cards/IngredientsCard.jsx`:
```jsx
import './IngredientsCard.css'

export function IngredientsCard({ recipe, onEdit }) {
  return (
    <div className="ingredients-card">
      <h2 className="card-heading">Ingredients</h2>
      {recipe.ingredients.length === 0 ? (
        <p className="card-empty">No ingredients found.</p>
      ) : (
        <ul className="ingredients-list">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="ingredients-item">{ing}</li>
          ))}
        </ul>
      )}
      {onEdit && (
        <button className="card-edit-btn" onClick={onEdit} aria-label="Edit ingredients">
          Edit ingredients
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add an `onEdit` button to `InstructionsCard`**

In `frontend/src/components/cards/InstructionsCard.jsx`, change the signature to `export function InstructionsCard({ recipe, onEdit }) {` and add, immediately before the closing `</div>` of `.instructions-card` (after the `{popover && (...)}` block):
```jsx
      {onEdit && (
        <button className="card-edit-btn" onClick={onEdit} aria-label="Edit instructions">
          Edit instructions
        </button>
      )}
```

- [ ] **Step 3: Add a shared `.card-edit-btn` style**

Append to `frontend/src/components/cards/IngredientsCard.css`:
```css
.card-edit-btn {
  margin-top: 14px;
  width: 100%;
  min-height: 44px;
  padding: 10px 14px;
  border: 1px solid #FCA5A5;
  border-radius: 12px;
  background: #FFF7F7;
  color: #DC2626;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}
.card-edit-btn:hover { background: #FEE2E2; }
.card-edit-btn:focus-visible { outline: 2px solid #DC2626; outline-offset: 2px; }
```
Then import that shared style once in `InstructionsCard.jsx` by adding at the top: `import '../cards/IngredientsCard.css'` is already same-dir; instead append the identical block to `frontend/src/components/cards/InstructionsCard.css` (so each card owns its styling and no cross-import is needed). Use the exact same CSS block as above.

- [ ] **Step 4: Convert `NutritionCard` to read-only totals + an edit entry point**

In `frontend/src/components/cards/NutritionCard.jsx`:
- Remove `import { EditIngredientsModal } from '../EditIngredientsModal.jsx'`.
- Remove the `editing` state and the trailing `{editing && data && (<EditIngredientsModal .../>)}` block.
- Change the signature to `export function NutritionCard({ recipe, overrides = [], onEdit }) {`.
- Replace the existing edit button block:
```jsx
          {actions && recipe.ingredients.length > 0 && (
            <button className="nutrition-edit-btn" onClick={() => setEditing(true)} aria-label="Edit ingredients">
              Edit ingredients
            </button>
          )}
```
with:
```jsx
          {onEdit && recipe.ingredients.length > 0 && (
            <button className="nutrition-edit-btn" onClick={onEdit} aria-label="Edit ingredients">
              Edit ingredients & nutrition
            </button>
          )}
```
Leave the override-aware `getNutrition(recipe.ingredients, recipe.servings, overrides)` effect unchanged.

- [ ] **Step 5: Simplify `useSavedRecipes.add` to take the document only**

In `frontend/src/hooks/useSavedRecipes.js`, replace the `add` callback with:
```js
  const add = useCallback(async (recipe) => {
    const { recipe: saved } = await createSavedRecipe(recipe)
    setList((prev) => [...prev, saved])
    return saved
  }, [])
```

- [ ] **Step 6: Write a failing test for `RecipeDetailPage` wiring**

Create `frontend/src/pages/__tests__/RecipeDetailPage.test.jsx` (all mocks are
self-contained — no outer-variable references — to avoid `vi.mock` hoisting/TDZ
issues; `RecipeCarousel` renders all slides in the DOM, so every card's edit
button is queryable):
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RecipeDetailPage } from '../RecipeDetailPage.jsx'

vi.mock('../../api/recipes.js', () => ({
  getNutrition: vi.fn().mockResolvedValue({
    perServing: { calories: 100, fat: 1, carbs: 1, protein: 1 },
    totals: { calories: 200, fat: 2, carbs: 2, protein: 2 },
    items: [{ name: '2 eggs', matched: true, matchedName: 'egg', calories: 140, excluded: false }],
    servings: 2,
  }),
  saveRecipe: vi.fn(),
}))

vi.mock('../../api/savedRecipes.js', () => ({
  listSavedRecipes: vi.fn().mockResolvedValue({ recipes: [] }),
  createSavedRecipe: vi.fn().mockResolvedValue({ recipe: { id: 1 } }),
  deleteSavedRecipe: vi.fn(),
  updateRecipe: vi.fn().mockResolvedValue({ recipe: {} }),
}))

vi.mock('../../context/RecipeContext.jsx', () => ({
  useRecipe: () => ({ recipe: { title: 'Soup', servings: '2', ingredients: ['2 eggs', 'salt'], instructions: ['mix'], sourceUrl: 'http://x' } }),
}))

describe('RecipeDetailPage editing', () => {
  it('opens the ingredients editor from a card edit button', async () => {
    render(<MemoryRouter><RecipeDetailPage /></MemoryRouter>)
    const btns = await screen.findAllByRole('button', { name: /edit ingredients/i })
    fireEvent.click(btns[0])
    expect(screen.getByRole('dialog', { name: /edit ingredients/i })).toBeInTheDocument()
  })

  it('opens the instructions editor from the Instructions card edit button', async () => {
    render(<MemoryRouter><RecipeDetailPage /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /edit instructions/i }))
    expect(screen.getByRole('dialog', { name: /edit instructions/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 7: Run to verify fail**

Run (from `frontend/`): `npm run test -- src/pages/__tests__/RecipeDetailPage.test.jsx`
Expected: FAIL (page still uses overrides hook / old props).

- [ ] **Step 8: Rewrite `RecipeDetailPage` to own the document**

Replace the contents of `frontend/src/pages/RecipeDetailPage.jsx`:
```jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRecipe } from '../context/RecipeContext.jsx'
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
import { useRecipeEditor } from '../hooks/useRecipeEditor.js'
import { saveRecipe } from '../api/recipes.js'
import { updateRecipe } from '../api/savedRecipes.js'
import { RecipeCarousel } from '../components/RecipeCarousel.jsx'
import { ImageCard } from '../components/cards/ImageCard.jsx'
import { IngredientsCard } from '../components/cards/IngredientsCard.jsx'
import { InstructionsCard } from '../components/cards/InstructionsCard.jsx'
import { NutritionCard } from '../components/cards/NutritionCard.jsx'
import { IngredientsEditor } from '../components/IngredientsEditor.jsx'
import { InstructionsEditor } from '../components/InstructionsEditor.jsx'
import './RecipeDetailPage.css'

export function RecipeDetailPage() {
  const { recipe } = useRecipe()
  const navigate = useNavigate()
  const { add, remove, findSaved } = useSavedRecipes()
  const [saveDbState, setSaveDbState] = useState('idle')
  const [editing, setEditing] = useState(null) // 'ingredients' | 'instructions' | null

  // All hooks must run before any early return (rules of hooks).
  const savedRow = recipe ? findSaved(recipe) : null

  // Seed the working document from the saved row (rich) if present, else the scraped recipe.
  const editor = useRecipeEditor(savedRow || recipe || {})

  // Debounced autosave for already-saved recipes. Skips the initial seed.
  // Depend on the document arrays (which change only on real edits), not on
  // toPayload (whose identity changes every render); read the latest payload
  // inside the timeout via closure.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!savedRow) return
    const t = setTimeout(() => {
      updateRecipe(savedRow.id, editor.toPayload()).catch(() => {})
    }, 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRow, editor.ingredients, editor.instructions])

  if (!recipe) {
    return <Navigate to="/scrape" replace />
  }

  const fav = !!savedRow
  const derivedRecipe = { ...recipe, ingredients: editor.ingredientTexts, instructions: editor.instructionTexts }

  const handleToggleFav = () => {
    if (savedRow) {
      remove(savedRow.id)
    } else {
      add(editor.toPayload())
    }
  }

  const handleSaveToDb = async () => {
    if (saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate') return
    setSaveDbState('loading')
    try {
      await saveRecipe(derivedRecipe)
      setSaveDbState('saved')
    } catch (err) {
      if (err.status === 400) setSaveDbState('duplicate')
      else { setSaveDbState('error'); setTimeout(() => setSaveDbState('idle'), 3000) }
    }
  }

  return (
    <div className="recipe-detail-page">
      <header className="detail-header">
        <button className="detail-back" onClick={() => navigate(-1)} aria-label="Go back">
          <svg className="detail-back__icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
      </header>
      <RecipeCarousel
        slides={[
          <ImageCard recipe={derivedRecipe} isFav={fav} onToggleFav={handleToggleFav} saveDbState={saveDbState} onSaveToDb={handleSaveToDb} />,
          <IngredientsCard recipe={derivedRecipe} onEdit={() => setEditing('ingredients')} />,
          <InstructionsCard recipe={derivedRecipe} onEdit={() => setEditing('instructions')} />,
          <NutritionCard recipe={derivedRecipe} overrides={editor.overrides} onEdit={() => setEditing('ingredients')} />,
        ]}
      />
      {editing === 'ingredients' && (
        <IngredientsEditor editor={editor} items={editor.ingredients} onClose={() => setEditing(null)} />
      )}
      {editing === 'instructions' && (
        <InstructionsEditor editor={editor} items={editor.instructions} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
```

- [ ] **Step 9: Delete the superseded Project 2 files**

```bash
git rm frontend/src/components/EditIngredientsModal.jsx frontend/src/components/EditIngredientsModal.css frontend/src/components/__tests__/EditIngredientsModal.test.jsx frontend/src/hooks/useIngredientOverrides.js frontend/src/hooks/__tests__/useIngredientOverrides.test.js
```

- [ ] **Step 10: Run to verify pass**

Run (from `frontend/`): `npm run test -- src/pages/__tests__/RecipeDetailPage.test.jsx`
Expected: PASS (both tests).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/cards/IngredientsCard.jsx frontend/src/components/cards/IngredientsCard.css frontend/src/components/cards/InstructionsCard.jsx frontend/src/components/cards/InstructionsCard.css frontend/src/components/cards/NutritionCard.jsx frontend/src/hooks/useSavedRecipes.js frontend/src/pages/RecipeDetailPage.jsx frontend/src/pages/__tests__/RecipeDetailPage.test.jsx
git commit -m "feat: wire editable document into cards and RecipeDetailPage; remove overrides modal/hook"
```

---

## Task 11: Full suite + manual verification

- [ ] **Step 1: Run the full backend suite**

Run (from `backend/`): `node --test`
Expected: all PASS.

- [ ] **Step 2: Run the full frontend suite**

Run (from `frontend/`): `npm run test -- --run`
Expected: all PASS. Fix any test that referenced the removed `EditIngredientsModal` / `useIngredientOverrides` (there should be none after Task 10; if a stale import remains, remove it).

- [ ] **Step 3: Manual end-to-end check (mobile width ~390px)**

Start backend (`node server.js`) and frontend (`npm run dev`), open DevTools device toolbar. Scrape a recipe → open the detail carousel:
- **Ingredients card → Edit ingredients:** edit a line's text; add a line; delete a line; drag-reorder; on a line use Replace (search → pick), Amount (e.g. ¼ cup), Manual (type macros), Exclude, Reset. Close.
- **Nutrition card:** totals reflect the edits (manual lines contribute their typed values; excluded lines drop out); the "Edit ingredients & nutrition" button opens the same editor.
- **Instructions card → Edit instructions:** edit text; add; delete; drag-reorder. Close.
- Tap the heart to save → the recipe persists with edits. Reopen it from the Saved page → ingredients, instructions, and nutrition rehydrate exactly.
- Edit an already-saved recipe → wait ~1s (debounced autosave) → reopen → changes persisted.

- [ ] **Step 4: Final commit (if any docs/cleanup)**

```bash
git add -A
git commit -m "chore: editable recipe verification pass"
```

---

## Self-Review Notes (for the implementer)

- **`combine.js` stays index-based per request.** The frontend always sends a consistent `(ingredientTexts, overrides)` snapshot; index fragility was only a persistence problem, solved by storing nutrition embedded per line in `ingredientsData`.
- **Two save paths remain distinct.** The heart (`useSavedRecipes.add` → `POST /saved-recipes`, per-user, carries the document) vs. `handleSaveToDb` (`/save-recipe`, the global CSV catalog) — the latter is untouched and just receives the derived text recipe.
- **Request vs. response shape for ingredients.** Create/update payloads carry the rich array under `ingredientsData`; `deserializeRecipe` returns both `ingredients` (plain text, backward-compat for existing consumers) and `ingredientsData` (rich, for the editor). The editor seeds from `ingredientsData`.
- **Nutrition modes are mutually exclusive at the top level.** Setting food/amount clears `excluded`/`manual`; setting manual or excluding replaces the line's nutrition. `food` + `amount` can coexist (replace the food *and* re-scale).
- **Autosave skips the initial render** (via `firstRun` ref) and only runs for already-saved recipes; the working document is never re-seeded after a save, so ids stay stable.
- **Legacy saved recipes** (no `ingredientsData`) deserialize from the plain `ingredients` strings; the first edit + autosave/save populates `ingredientsData`.
- **Drag-reorder** is covered by `useRecipeEditor`/`recipeDocument` unit tests (the reorder handler); editor component tests cover text/add/delete/nutrition, not raw pointer events.
