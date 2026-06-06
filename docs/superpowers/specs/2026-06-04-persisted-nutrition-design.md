# Persisted Nutrition for Saved Recipes (future-plans #11)

**Date:** 2026-06-04
**Status:** Approved (design)

## Summary

Store the computed nutrition result on each `SavedRecipe` and recompute it only
when the inputs that affect nutrition change. Today `NutritionCard` re-POSTs
`/get-nutrition` on every mount/override change, which means a cold Render dyno,
a cold Neon connection, and (often) live FatSecret calls every time a saved
recipe is viewed. Nutrition for a saved recipe is deterministic given its
ingredients + overrides + servings, so it should be computed once per change and
read back from the DB thereafter.

## Current state (as built)

- `SavedRecipe` (`backend/prisma/schema.prisma`) stores `ingredients`,
  `instructions`, `ingredientsData` (rich items incl. `nutrition` overrides),
  `servings`, etc. It does **not** store computed nutrition.
- `serializeRecipe` / `deserializeRecipe` (`backend/recipes/savedRecipeHandlers.js`)
  round-trip the rich `ingredientsData`. The create/update/list/search handlers
  are built by factory functions that receive `prisma` (and auth) via
  `createSavedRecipeRouter`.
- `combineNutrition(ingredients, servings, { searchFood, overrides })`
  (`backend/nutrition/combine.js`) produces `{ servings, totals, perServing, items, estimated }`.
  `server.js` already holds a live `resolveFood` resolver used by `/get-nutrition`.
- Frontend `NutritionCard` (`frontend/src/components/cards/NutritionCard.jsx`)
  always calls `getNutrition(recipe.ingredients, recipe.servings, overrides)` in a
  `useEffect`. `RecipeDetailPage` autosaves edits to the saved row (debounced)
  whenever `editor.ingredients`/`instructions` change.

## Design

### Data model
Add two nullable columns to `SavedRecipe`:
- `nutrition` (text / JSON) — the full `combineNutrition` result.
- `nutritionSig` (text) — a stable hash of the nutrition inputs.

### Signature
`nutritionSig = sha256(canonicalJSON({ ingredients: <texts>, overrides: <deriveOverrides>, servings }))`.
Computed from the same data `/get-nutrition` consumes. A new helper
`nutritionSignature(recipe)` lives alongside the saved-recipe handlers (or a small
`nutrition/signature.js`) so server and tests share one implementation.

### Compute-on-change
- Inject a `computeNutrition(ingredients, servings, overrides)` function into the
  saved-recipe router (same DI pattern as `prisma`). It wraps `combineNutrition`
  with the server's live `resolveFood`. `server.js` passes it in when constructing
  the router; because `resolveFood` is reassigned after the USDA index loads, the
  injected function must read the *current* resolver (pass a getter / thunk, not a
  captured value).
- **Create:** compute nutrition + signature, store both.
- **Update:** compute the new signature; if it differs from the stored one (or
  `nutrition` is null), recompute and store; otherwise keep the stored nutrition.
- Recompute is best-effort: if `computeNutrition` throws (FatSecret/USDA
  unavailable), persist the recipe without nutrition (`nutrition = null`) rather
  than failing the save. The frontend then falls back to a live fetch.

### Serving the data
- `deserializeRecipe` parses and returns `nutrition` (object or `null`) plus
  `nutritionSig`.
- `NutritionCard` accepts an optional `nutrition` prop. When provided (saved
  recipe with stored nutrition), it renders directly and skips the fetch. When
  absent (just-scraped/unsaved recipe, or recompute failed), it fetches live as
  today.
- `RecipeDetailPage` passes `savedRow.nutrition` into `NutritionCard` for saved
  recipes. After an edit, the debounced `updateRecipe` recomputes server-side and
  returns the fresh row; the card re-renders from the new stored nutrition.

## Cross-cutting

- **Migration:** `prisma db push` adds the nullable columns; existing rows have
  `nutrition = null` and lazily populate on next save/update or fall back to live
  fetch on view. No backfill required.
- **Testing (TDD):**
  - `nutritionSignature` — stable across key order, changes when ingredients/
    overrides/servings change.
  - create handler stores nutrition + sig; update recomputes only when sig changes
    (assert `computeNutrition` call count); update tolerates a throwing
    `computeNutrition` (saves with `nutrition = null`).
  - `deserializeRecipe` returns parsed nutrition / null.
  - `NutritionCard` renders from the `nutrition` prop without calling the API; falls
    back to fetch when the prop is absent.
- **Mobile-first:** no new UI surfaces; existing card layout unchanged.

## Out of scope
- Caching of *unsaved* (scrape-time) nutrition — handled by the React Query plan (#1).
- URL/scrape caching and crowd-sourced overrides (#10).
- Changing the matching/scoring or `combineNutrition` math.

## Sequencing
Build this **before** the React Query plan (#1); that plan seeds its nutrition
query cache from the stored value this plan produces.
