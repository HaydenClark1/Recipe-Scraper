# Fully Editable Recipe & Per-Ingredient Nutrition — Design Spec

**Date:** 2026-06-02
**Status:** Approved (design)

## Context

This is the fast-follow to **Project 2** (`2026-06-02-ingredient-overrides-design.md`),
which let a user replace a bad food match, fix a misparsed amount, or exclude an
ingredient line — corrections that anchored to a **frozen ingredient array by
index** and persisted in a separate `IngredientOverride` table.

This project makes the recipe **fully editable**: a user can edit the text of
ingredients and instructions, **add / edit / delete / reorder** both, edit the
matched food (search USDA → FatSecret), and edit an ingredient's nutrition values
directly. Every change persists so it can be referenced later.

The moment lines can be reordered, added, and deleted, index-anchoring breaks —
"index 3" no longer reliably means the same ingredient over time. So per-line
nutrition must travel **with the line**, not by position. This supersedes
Project 2's index-keyed persistence.

**Relationship to Project 2:** Build on the `feat/ingredient-overrides` branch.
**Reuse:** the food-search endpoint (`/search-foods`), the scaling engine
(`combine.js`), the override wire shape, and the edit-modal / search-picker /
amount-editor scaffolding. **Supersede:** the `IngredientOverride` table — it is
removed before it is ever applied (the `db push` was never run successfully, so
nothing is lost), and per-line nutrition moves into the recipe document.

## Goal

Let a user edit any recipe into the shape they want — text, structure, and
nutrition — with live recompute, and persist the whole document per user:
edit-anywhere, persist-on-save (and debounced autosave once saved).

## Scope

**In scope:**
- Edit ingredient text; add, delete, and **drag-reorder** ingredient lines.
- Edit instruction text; add, delete, and **drag-reorder** instruction steps.
- Per ingredient, edit nutrition by any of:
  - **Replace the matched food** — type a term, search DB (USDA), fall back to
    FatSecret, pick a result.
  - **Edit the scale/amount** — change the quantity/unit used for scaling a
    food-based line (e.g. re-express a "per tsp" match as "per ¼ cup").
  - **Manual values** — type final calories/fat/carbs/protein for the line.
  - **Exclude** — drop the line from the total.
- Persist the full edited document (edit-anywhere; captured on save; debounced
  autosave for already-saved recipes).

**Out of scope:**
- Editing the global recipe-catalog CSV (`/save-recipe`) — unchanged.
- Auto-migrating device-local favorites into the DB.
- Password reset / email verification / OAuth.
- Recipe-level nutrition entry independent of ingredients (totals are always the
  sum of per-line contributions).

## Key Decisions

| Decision | Choice |
|----------|--------|
| When can you edit? | **Any** recipe (scraped or saved). |
| When do edits persist? | **Edit-anywhere, persist-on-save.** Edits live in frontend state and recompute live; saving captures them. Already-saved recipes **debounced-autosave** via `PUT /saved-recipes/:id`. |
| Storage architecture | **Rich JSON document** (Approach 1): each ingredient is `{ id, text, nutrition }`, stored as JSON on `SavedRecipe`; instructions stay a plain string array. |
| Recompute | **Backend** stays the single source of scaling math; `/get-nutrition` keeps its `overrides` argument (gains a `manual` type). Frontend zips the document's embedded nutrition into an index-aligned overrides snapshot per request. |
| Per-line nutrition precedence | `excluded` → `manual` (final, unscaled) → food (`food` override or auto-search) **scaled** by `amount` (override or parsed). |
| Reorder UX | **Drag-and-drop** via `@dnd-kit` (touch + keyboard sensors, accessible). |
| Nutrition edit location | Lives in the **ingredients editor** (nutrition belongs to a line); `NutritionCard` stays read-only live totals with a shortcut into it. |
| Mobile | Mobile-first full-screen sheets; app ships to Google Play via Capacitor. |
| Frontend implementation | Use the `ui-ux-pro-max` skill when building the components. |

## The Working Document

Held in frontend state; the single source for the whole detail page:

```js
{
  title, servings, image, prepTime, totalTime, category, cuisine, sourceUrl,
  ingredients: [ { id, text, nutrition } ],   // id = stable, client-generated
  instructions: [ { id, text } ],              // id only for reorder keying
}
```

Per-ingredient `nutrition` (all fields optional; precedence top-down):

```js
{
  excluded: true,                               // → contributes 0
  manual:  { calories, fat, carbs, protein },   // → FINAL per-line values, NOT scaled
  food:    { foodName, foodDescription, fdcId }, // → replaces the auto-matched food
  amount:  { quantity, unit },                   // → re-scales the food
}
```

Resolution per line: **excluded** wins → else **manual** (final numbers, no
scaling) → else the food (the `food` override, or auto-search from the text)
**scaled** by `amount` (override) or the parsed amount. Picking a food may pre-fill
the manual editor so the user can start from real numbers, but once `manual` is
set its values are final.

## Data Model (Prisma — modifies existing `schema.prisma`)

```prisma
model SavedRecipe {
  // ...existing fields...
  ingredientsData String? @db.NVarChar(Max)   // JSON: [{ id, text, nutrition }]
  // remove: overrides IngredientOverride[]
}

// remove model IngredientOverride entirely
```

- **`ingredientsData`** is the source of truth for ingredients + per-line nutrition.
- **`ingredients` / `instructions`** stay as plain JSON string arrays, **derived**
  from the document on save, so existing consumers (the global-catalog
  `/save-recipe` CSV, `IngredientsCard`, `/get-nutrition` input) keep working.
  One atomic write keeps text and nutrition in lockstep.
- **Legacy saved recipes** (null `ingredientsData`): deserialize rebuilds the
  document from the plain `ingredients` strings with `nutrition: null` and
  generated ids; the first edit populates `ingredientsData`.
- Instructions need no schema change; the editor assigns ephemeral ids for
  reorder keys only.

## Canonical override wire shape (`/get-nutrition`)

Reused from Project 2, plus `manual`:

```js
{ index, type: 'replace' | 'exclude' | 'amount' | 'manual',
  foodName?, foodDescription?, fdcId?,        // replace
  quantity?, unit?,                            // amount
  calories?, fat?, carbs?, protein? }          // manual
```

The frontend derives `ingredients` (texts) and the index-aligned `overrides` from
the working document at request time, so `combine.js` stays index-based **per
request** — index fragility was only a persistence problem.

## Backend

**`schema.prisma`** — add `ingredientsData`; remove `IngredientOverride` + relation.

**`nutrition/combine.js`** — add override type `manual`: when present and not
excluded, push an item with the typed final macros, `overridden: true`,
`matched: true`, **no scaling**, contributing those values to totals. Loop
precedence: `exclude` → `manual` → `replace`/`amount` (existing).

**`server.js`** — `/get-nutrition` continues to accept and pass `overrides`
(already validated as an array; unknown/out-of-range entries are safely ignored).

**`recipes/savedRecipeHandlers.js`** (replaces Project 2's override de/serialization):
- `serializeRecipe(recipe, userId)` — writes `ingredientsData = JSON.stringify(recipe.ingredients)`
  (each element `{ id, text, nutrition }`), and derives the flat `ingredients`
  string column from those `text`s and `instructions` from the edited array.
- `deserializeRecipe(row)` — parse `ingredientsData` →
  `ingredients: [{ id, text, nutrition }]`; **legacy fallback** if null. Return the
  plain `instructions` array too.
- `makeCreateHandler` — persists the full document; drops nested `overrides.create`.
- **New** `makeUpdateHandler` → `PUT /saved-recipes/:id` — ownership check
  (`404` if not `req.userId`), then replace editable fields (`title`,
  `ingredients`, `instructions`, `ingredientsData`, `servings`, `prepTime`,
  `totalTime`, `category`, `cuisine`). Full editable-fields replace (not a partial
  PATCH). Returns `200 { recipe }`.
- Remove `makeReplaceOverridesHandler`, `toOverrideRow`, `fromOverrideRow`.

**`recipes/savedRecipeRoutes.js`** — add `PUT /:id`; remove `PUT /:id/overrides`.

**Unchanged & reused:** `/search-foods`, `makeUsdaSearchMany`, `makeFoodsResolver`,
all existing scaling math.

## Frontend

**New hook `useRecipeEditor(initialDoc)`** — owns the working document; the single
source for the page. Subsumes `useIngredientOverrides`.
- Ingredient ops: `editIngredientText(id, text)`, `addIngredient()`,
  `deleteIngredient(id)`, `reorderIngredients(fromId, toId)`.
- Instruction ops: `editInstruction(id, text)`, `addInstruction()`,
  `deleteInstruction(id)`, `reorderInstructions(fromId, toId)`.
- Per-line nutrition: `setFood(id, food)`, `setAmount(id, qty, unit)`,
  `setManual(id, macros)`, `exclude(id)`, `clearNutrition(id)`.
- Derives for consumers: `ingredientTexts[]`, `instructionTexts[]`, and the
  index-aligned `overrides[]` for `/get-nutrition` and persistence.

**Editor UI** (built with the `ui-ux-pro-max` skill; mobile-first full-screen
sheets; ≥44px touch targets; `@dnd-kit` drag-reorder with keyboard fallback):
- **Ingredients editor** (opened from `IngredientsCard`; extends Project 2's
  `EditIngredientsModal`) — per row: editable text, nutrition controls (Replace via
  search, Amount/scale, Manual values, Exclude), delete, drag handle; plus
  "Add ingredient." All per-line nutrition editing lives here.
- **Instructions editor** (opened from `InstructionsCard`) — editable step text,
  add, delete, drag handle.
- `NutritionCard` — read-only live totals + breakdown, with a shortcut button into
  the ingredients editor.

**`RecipeDetailPage`** becomes the document owner:
- Seeds `useRecipeEditor` from `savedRow` (persisted `ingredientsData` +
  instructions) if saved, else from the scraped `recipe` (plain strings →
  `nutrition: null`).
- All cards render from the document, so edits show everywhere live;
  `NutritionCard` recomputes from derived overrides.
- **Persistence:** unsaved → on Save (heart) `createSavedRecipe(documentPayload)`.
  Already-saved → **debounced autosave** (~1s) `updateRecipe(id, documentPayload)`
  via `PUT /:id`.

**API (`savedRecipes.js`):** `createSavedRecipe(doc)` carries the full document;
**new** `updateRecipe(id, doc)` → `PUT /:id` (replaces `updateOverrides`).
`getNutrition` unchanged (overrides derived from the document).

**New dependency:** `@dnd-kit/core` + `@dnd-kit/sortable` (frontend only).

## Data Flow

1. `RecipeDetailPage` loads → builds the working document from `savedRow` (if
   saved) else the scraped recipe.
2. Cards render from the document. `NutritionCard` calls
   `getNutrition(ingredientTexts, servings, overrides)` → live totals.
3. User opens an editor → mutates the document (text / add / delete / reorder /
   nutrition). Nutrition-affecting changes re-call `getNutrition`.
4. Persist: unsaved recipe → document rides along on the next **Save**;
   already-saved recipe → debounced `updateRecipe(id, document)`.

## Error Handling

- **Food search fails** → inline "Search unavailable, try again"; rest of edit
  state untouched.
- **Live recompute fails** → keep last-good totals, show the existing "Nutrition
  data unavailable" affordance with retry; working document never lost.
- **Autosave fails** → toast "Couldn't save changes — retrying," keep working
  state, retry with backoff. `401` flows through the existing `apiClient`
  token-clear/redirect; `404` (not owned) stops autosave and surfaces an error.
- **Validation** → title required to save. Empty text rows allowed while editing,
  trimmed/dropped on persist. Manual macros numeric, blanks → 0, negatives
  rejected.
- **Nutrition follows lines** → keyed to each line's stable `id`, so
  reorder/add/delete keep nutrition attached; deleting a line drops its nutrition;
  a newly-added line starts `nutrition: null` and auto-searches from its text on
  the next recompute.
- **Concurrent recompute** → in-flight `/get-nutrition` calls use the existing
  `alive` guard; the latest snapshot wins.
- **Legacy saved recipes** → deserialize fallback builds the document from plain
  arrays.

## Testing

**Backend (`node --test`, mocked Prisma/resolver):**
- `combine.js` — `manual` override yields final, unscaled values that flow into
  totals; precedence (`exclude` beats `manual` beats food).
- handlers — `serializeRecipe` writes `ingredientsData` + derived flat arrays;
  `deserializeRecipe` parses it **and** the legacy fallback; `create` persists a
  document; `PUT /:id` updates scoped to owner (`404` otherwise); cascade delete
  drops the recipe.

**Frontend (Vitest + Testing Library):**
- `useRecipeEditor` — all CRUD, reorder result, every nutrition action, and correct
  derived `overrides`/texts (incl `manual` + `exclude` precedence).
- Ingredients editor — text edit, add, delete, reorder (via the reorder handler),
  search→pick (`setFood`), amount, manual, exclude, all reflected in rows.
- Instructions editor — text edit, add, delete, reorder.
- `NutritionCard` — derives overrides incl `manual` and recomputes.
- Persistence — unsaved carries the document to `createSavedRecipe`; saved triggers
  debounced `updateRecipe`; autosave failure keeps state.
- api modules hit the right endpoints.

Drag-reorder is unit-tested via the editor's reorder handler, not raw pointer
events.

## Success Criteria

- On any recipe, a user can edit ingredient and instruction text, add / delete /
  drag-reorder both, and the page reflects edits live.
- Per ingredient, a user can replace the matched food (via search), change the
  scale/amount, type manual final nutrition values, or exclude the line, and totals
  recompute live.
- Saving a recipe persists the whole edited document (text + structure +
  nutrition); reopening rehydrates it exactly.
- Editing an already-saved recipe debounced-autosaves; another user cannot read or
  modify it.
- Deleting a saved recipe removes its data; legacy saved recipes (pre-this-feature)
  open and edit cleanly.
- All backend + frontend tests pass; existing scrape / search / nutrition / auth /
  global-catalog-save features are unaffected.
