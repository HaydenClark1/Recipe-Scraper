# Plan: Persisted Nutrition for Saved Recipes (future-plans #11)

**Spec:** `docs/superpowers/specs/2026-06-04-persisted-nutrition-design.md`
**Build order:** before the React Query plan (#1).

Each slice is independently shippable and test-first (backend uses `node:test`,
frontend uses Vitest).

## Slice 1 — Nutrition signature helper
- **Test** (`backend/nutrition/__tests__/signature.test.js`): same inputs → same
  hash regardless of object key order; hash changes when an ingredient text, an
  override, or `servings` changes; whitespace-insensitive on ingredient text.
- **Code** (`backend/nutrition/signature.js`): `nutritionSignature({ ingredients, overrides, servings })`
  → `sha256` of a canonical JSON (sorted keys, normalized whitespace). Export it.

## Slice 2 — Schema columns
- Add to `SavedRecipe` (`backend/prisma/schema.prisma`): `nutrition String?` and
  `nutritionSig String?` (Postgres text).
- `npx prisma db push` (nullable, no backfill). Regenerate client.

## Slice 3 — computeNutrition injection
- **Code** (`backend/server.js`): build `computeNutrition(ingredients, servings, overrides)`
  that calls `combineNutrition(ingredients, servings, { searchFood: resolveFood, overrides })`.
  Because `resolveFood` is reassigned after the USDA index loads, pass a thunk/getter
  (e.g. `() => resolveFood`) so the handler always uses the current resolver.
- Thread `computeNutrition` into `createSavedRecipeRouter(prisma, auth, { computeNutrition })`
  (extend the factory signature; keep existing args).

## Slice 4 — Store nutrition on create/update
- **Test** (`backend/recipes/__tests__/savedRecipeHandlers.test.js`):
  - create: stores `nutrition` (from a stubbed `computeNutrition`) and `nutritionSig`.
  - update with unchanged inputs: `computeNutrition` **not** called; stored nutrition kept.
  - update with changed inputs: `computeNutrition` called once; nutrition + sig updated.
  - update where `computeNutrition` throws: recipe still saved with `nutrition = null`.
- **Code** (`backend/recipes/savedRecipeHandlers.js`):
  - `serializeRecipe` stays the source of row fields; add a `withNutrition(row, recipe, prevSig)`
    step in the create/update handlers that computes the signature and, when it
    differs from `prevSig` (or no stored nutrition), calls `computeNutrition`
    (try/catch → `null` on failure) and sets `nutrition`/`nutritionSig`.
  - `deserializeRecipe` returns parsed `nutrition` (object | null) and `nutritionSig`.

## Slice 5 — Frontend renders stored nutrition
- **Test** (`frontend/src/components/cards/__tests__/NutritionCard.test.jsx` — add if
  absent): with a `nutrition` prop, renders facts/breakdown and does **not** call
  `getNutrition`; without it, falls back to the live fetch (existing behavior).
- **Code:**
  - `NutritionCard` accepts optional `nutrition`; when present, initialize state from
    it and skip the effect fetch (still recompute via fetch only when no prop).
  - `RecipeDetailPage` passes `savedRow.nutrition` to `NutritionCard` for saved
    recipes. The existing debounced `updateRecipe` returns the recomputed row; feed
    its `nutrition` back so the card updates after edits.

## Verification
- `cd backend && node --test` (signature + handlers green).
- `cd frontend && npx vitest run` (NutritionCard green).
- Manual: save a recipe → view it offline-fast (no `/get-nutrition` call in network
  tab); edit an amount → row autosaves and nutrition refreshes from the recompute.

## Notes / risks
- Recompute-on-save can be slow (FatSecret) but happens once per change, not per
  view — the intended trade. Keep it best-effort so a slow/failing external call
  never blocks the save.
