# Ingredient Editing UI & Persisted Overrides — Design Spec (Project 2 of 2)

**Date:** 2026-06-02
**Status:** Approved (design)

## Context

This is **Project 2** of the two-project decomposition begun in
`2026-06-01-users-persistence-foundation-design.md`. Project 1 delivered
email/password auth and DB-backed per-user `SavedRecipe` rows. Project 2 lets a
user **correct the nutrition matching** for a recipe's ingredients and have those
corrections **persist per user**.

Today `NutritionCard` calls `POST /get-nutrition` with the ingredient lines and
servings; `combine.js` parses each line, searches a food (USDA via `Fuse`, then
FatSecret fallback through `makeFoodResolver`), scales by mass/unit, and returns
`{ items, totals, perServing, servings, estimated }`. The matches are frequently
wrong ("chicken breasts" → "chicken broth") and there is no way to fix them.

## Goal

Let a user replace a bad food match, fix a misparsed amount, or exclude a line
from the nutrition total — editing on **any** recipe with live recompute, and
**persisting** those edits per user against the `SavedRecipe`.

## Scope

**In scope (each override anchors to an existing ingredient line):**
- **Replace the matched food** — search foods, pick a better match.
- **Adjust quantity / unit** — override the parsed amount used for scaling.
- **Exclude an ingredient** — drop a line from the nutrition total.

**Out of scope:**
- **Add a missing ingredient** — deferred to a fast-follow (it is a net-new row
  with no source line, which complicates index keying).
- Global recipe-catalog CSV behavior (unchanged from Project 1).
- Auto-migrating existing device-local favorites into the DB.
- Password reset / email verification / OAuth (future).

## Key Decisions

| Decision | Choice |
|----------|--------|
| When can you edit? | **Any** recipe (scraped or saved). |
| When do edits persist? | Edits live in frontend state and recompute live; **saving the recipe captures them**. Already-saved recipes persist via a dedicated update on modal close. |
| Recompute | **Backend** — `combine.js` is the single source of the scaling math; `/get-nutrition` grows an `overrides` argument. No JS duplication. |
| Override storage | **Separate `IngredientOverride` table** (child of `SavedRecipe`). |
| Override keying | `(savedRecipeId, ingredientIndex, type)`; index anchors to the frozen saved-recipe ingredient array. |
| Edit UI | Read-only nutrition card + **"Edit ingredients"** button → full-height popup listing every ingredient with per-row Replace / Amount / Exclude; food search is a nested step. |
| Mobile | Mobile-first; full-screen sheet at phone widths (app ships to Google Play via Capacitor). |
| Frontend implementation | Use the `ui-ux-pro-max` skill when building the components. |

## Data Model (Prisma — added to existing `schema.prisma`)

```prisma
model SavedRecipe {
  // ...existing fields...
  overrides    IngredientOverride[]
}

model IngredientOverride {
  id              Int         @id @default(autoincrement())
  savedRecipeId   Int
  savedRecipe     SavedRecipe @relation(fields: [savedRecipeId], references: [id], onDelete: Cascade)
  ingredientIndex Int                              // anchors to recipe.ingredients[i]
  type            String      @db.NVarChar(20)     // 'replace' | 'exclude' | 'amount'

  // 'replace' payload — what combine.js consumes to reconstruct a match:
  foodName        String?     @db.NVarChar(500)
  foodDescription String?     @db.NVarChar(1000)   // basis string parseFoodDescription parses
  fdcId           Int?                             // provenance, optional

  // 'amount' payload:
  quantity        Float?
  unit            String?     @db.NVarChar(50)

  createdAt       DateTime    @default(now())

  @@index([savedRecipeId])
  @@unique([savedRecipeId, ingredientIndex, type])
}
```

- `@@unique([savedRecipeId, ingredientIndex, type])` → at most one of each type per
  line, but a single line may carry both a `replace` and an `amount` row (fix the
  food *and* the quantity).
- `onDelete: Cascade` → deleting a recipe drops its overrides; the existing
  `deleteMany` on `SavedRecipe` is unchanged.
- `replace` stores `foodName` + `foodDescription` (exactly what `combine.js` uses
  via `match.food_name` / `parseFoodDescription(match.food_description)`), so the
  schema is not coupled to USDA vs FatSecret.

## Canonical override wire shape

Reused across recompute, create, and update:

```js
{ index, type: 'replace' | 'exclude' | 'amount',
  foodName?, foodDescription?, fdcId?,   // replace
  quantity?, unit? }                     // amount
```

## Backend

**New / extended files:**
- `backend/nutrition/usdaClient.js` (+ resolver) — add a **multi-result** search
  (top ~15) alongside the existing single-best `makeUsdaSearch`, with the same
  FatSecret fallback, returning `{ food_name, food_description, fdcId? }[]`.
- `backend/nutrition/combine.js` — accept `overrides` and apply per index before
  the existing math:
  - `exclude` → push an item with `excluded: true`, contributes 0 to totals.
  - `replace` → skip the search; use the override's food as the match.
  - `amount` → use override `quantity`/`unit` instead of `parseIngredient`'s.
  - Items gain `excluded` and `overridden` booleans. Out-of-range index ignored.
- `backend/recipes/savedRecipeHandlers.js` — create handler also inserts override
  rows in the same transaction; `deserializeRecipe` includes an `overrides` array;
  new handler to replace a recipe's override set.
- `backend/recipes/savedRecipeRoutes.js` — add `PUT /:id/overrides`.
- New route for `GET /search-foods` (next to `/get-nutrition` in `server.js`).

**Routes & contracts:**
- `GET /search-foods?q=<term>` → `200 { foods: [{ food_name, food_description, fdcId? }] }`;
  `400` on empty/short query. (Unauthenticated, like its sibling `/get-nutrition`;
  the frontend is route-guarded regardless.)
- `POST /get-nutrition { ingredients, servings, overrides? }` → same response shape
  as today, items additionally carry `excluded` / `overridden`.
- `POST /saved-recipes { recipe, overrides? }` → `201 { recipe }`; persists recipe
  + override rows in one transaction. (behind `authMiddleware`)
- `PUT /saved-recipes/:id/overrides { overrides }` → `200 { recipe }`; replaces the
  full override set (delete + recreate in a transaction); `404` if not owned by
  `req.userId`. (behind `authMiddleware`)
- `GET /saved-recipes` → recipes now include `overrides`.

## Frontend

**New files:**
- `src/api/foods.js` — `searchFoods(query)` → `GET /search-foods`.
- `src/hooks/useIngredientOverrides.js` — owns the working override array for the
  viewed recipe: `replace(index, food)`, `setAmount(index, qty, unit)`,
  `exclude(index)` / `unexclude(index)`; seeds from a saved recipe's overrides.
- `src/components/EditIngredientsModal.jsx` (+ `.css`) — full-height popup: per-row
  Replace / Amount / Exclude, nested food-search view. Mobile-first sheet.

**Modified:**
- `src/api/recipes.js` — `getNutrition(ingredients, servings, overrides)`.
- `src/api/savedRecipes.js` — `saveRecipe(recipe, overrides?)`;
  `updateOverrides(id, overrides)` → `PUT /saved-recipes/:id/overrides`.
- `src/components/cards/NutritionCard.jsx` — add the "Edit ingredients" button;
  pass working `overrides` into `getNutrition` so numbers reflect edits and
  recompute live; breakdown stays read-only.
- `src/pages/RecipeDetailPage.jsx` — hold override state via the hook; pass
  overrides to `saveRecipe`; for an already-saved recipe call `updateOverrides` on
  modal close.

All frontend components built with the `ui-ux-pro-max` skill and validated at
phone widths (~360–414px).

## Data Flow

1. Detail page loads → `NutritionCard` calls
   `getNutrition(ingredients, servings, overrides)` (empty, or rehydrated for a
   saved recipe).
2. Tap **Edit ingredients** → modal opens over the working set.
3. **Replace** → `searchFoods(q)` → pick → `hook.replace(i, food)`;
   **Amount** / **Exclude** mutate the hook. Each mutation re-calls `getNutrition`
   with the new overrides → live totals.
4. **Done** closes the modal. Unsaved recipe → overrides ride along on the next
   **Save**; already-saved recipe → `updateOverrides(id, overrides)` on close.

## Error Handling

- `/search-foods` empty/short `q` → `400`; modal shows "Type to search." Zero
  results → "No matches — try a simpler term."
- Search request fails → inline "Search unavailable, try again"; rest of the
  override set untouched.
- Live recompute fails after an edit → keep last good totals, show the existing
  "Nutrition data unavailable" affordance, allow retry; working overrides are not
  lost (they live in the hook, not the response).
- `PUT /saved-recipes/:id/overrides` not owned → `404`; `401` flows through the
  existing `apiClient` token-clear-and-redirect.
- Out-of-range `ingredientIndex` → ignored by `combine.js`; persistence rejects
  with `400`.

## Testing

**Backend (`node --test`, mocked Prisma/resolver):**
- `combine.js` — `exclude` zeroes a line and flags `excluded`; `replace` uses the
  override food instead of searching; `amount` overrides parsed qty/unit;
  totals/perServing reflect all three; out-of-range index ignored.
- multi-result food search — returns top-N in `{ food_name, food_description }`
  shape; FatSecret fallback path.
- `/search-foods` route — `400` on empty query; maps results.
- saved-recipe handlers — create persists `recipe` + `overrides` in one
  transaction; `PUT /:id/overrides` replaces the set, scoped to `req.userId`
  (`404` otherwise); `GET` deserializes overrides; cascade delete drops overrides.

**Frontend (Vitest + Testing Library):**
- `useIngredientOverrides` — replace/setAmount/exclude/unexclude produce the right
  array; seeds from a saved recipe.
- `EditIngredientsModal` — renders rows; Replace runs a search and updates the row;
  Exclude strikes through; Done closes.
- `NutritionCard` — passes overrides into `getNutrition` and re-fetches on change.
- `foods` / `savedRecipes` api modules — hit the right endpoints.

## Success Criteria

- On any recipe, a user can replace a bad food match (via search), fix an amount,
  or exclude a line, and the nutrition totals recompute live.
- Saving a recipe persists its overrides; reopening the saved recipe rehydrates
  them and shows the corrected nutrition.
- Editing an already-saved recipe and closing the editor persists the new override
  set; another user cannot read or modify it.
- Deleting a saved recipe removes its overrides.
- All backend + frontend tests pass; existing scrape/search/nutrition/auth/save
  features are unaffected.
```
