# Ingredient Search & Saved-Recipe Search Improvements

**Date:** 2026-06-03
**Status:** Approved (design)

## Summary

Four related improvements, each independently shippable:

1. Surface what each ingredient line matched to (food + basis + grams) inside the ingredients editor.
2. Improve the "Replace" flow so it frames the candidate list as alternatives to the current match.
3. Add an always-available "Search the web" (FatSecret) button that returns multiple web results.
4. Flag ingredient lines whose amount can't be converted to a weight (e.g. `1 chicken breast`) and prompt the user to specify one — while still showing a best-guess estimate.
5. Add server-backed search over a user's saved recipes (title + ingredients).

These address future-plans items #2 (show match + unit), #4 (multiple options + web search), #7 (prompt for uncalculable amounts), and #8 (search saved recipes).

## Current state (as built)

- `GET /search-foods?q=` already returns a *ranked list* of USDA candidates (`makeUsdaSearchMany` over a Fuse index + `scoreFood`). FatSecret is only a silent single-result fallback (`fatsecretClient.searchFood` → `pickFood` returns `food[0]`).
- `NutritionCard` fetches `POST /get-nutrition`, receives `data.items` (per-line `{ name, matched, matchedName, matchedBasis, scaleFactor, grams, calories, ... }`), and on "Edit ingredients & nutrition" passes `data.items` into `IngredientsEditor` as the `nutritionItems` prop.
- `IngredientsEditor` accepts `nutritionItems` **but the `Row` component ignores it** — rows only show `item.nutrition` (override) summaries.
- `combineNutrition` silently estimates when an amount isn't convertible: `1 chicken breast` parses to `quantity=1, unit=null`, falls to `scale = quantity (1), approx = true`, and only sets the global `estimated` flag.
- `SavedPage` lists all favorites (already fully loaded client-side via `useSavedRecipes`); there is no search box.

## Slice 1 — Show what each line matched to (foundation)

**Goal:** Each editor `Row` displays the computed match for its ingredient.

- In `IngredientsEditor`, map each `Row` to its computed result from `nutritionItems` by index (the editor `ingredients` order and the `/get-nutrition` `items` order are the same source order).
- Render below the ingredient text, e.g.: `matched to "Chicken, broilers or fryers, breast" · per 100g · 140 g`. When `matched === false`, show `no match`.
- An explicit user override (`item.nutrition`) takes display priority over the computed auto-match (existing `nutritionSummary` behavior is preserved for overridden lines).

**Units/structure:** no API change. Pure frontend wiring of an existing prop.

## Slice 2 — Improved Replace flow + multiple options

**Decision:** Keep the on-demand "Replace" button; frame results as alternatives to the current match.

- `ReplacePanel` header shows the current match (from Slice 1 data): `Currently: <matchedName>`.
- Below it, the ranked candidate list from `/search-foods` (mechanism unchanged).
- Selecting a candidate calls existing `editor.setFood(item.id, food)`.

## Slice 3 — "Search the web" button (FatSecret, multiple results)

**Decision:** Always-available button in the Replace panel.

**Backend:**
- Add `source` query param to `GET /search-foods?q=&source=local|web`. `local` (default) = USDA `resolveFoods` (today's behavior). `web` = FatSecret multi-result.
- Add `searchFoods` (plural) to `fatsecretClient`: return *all* foods from `data.foods.food` (array or single), each mapped to `{ food_name, food_description }` (same shape USDA emits, so `parseFoodDescription` reads it unchanged). Keep existing single-result `searchFood`/`pickFood` for the nutrition-resolver fallback path.
- `server.js` wires `source=web` to the new FatSecret multi-result function (independent of the USDA index load state).

**Frontend:**
- `api/foods.js`: `searchFoods(q, source)` → appends `&source=` when provided.
- `ReplacePanel` adds a "Search the web" button that re-runs the current query with `source=web`; results render in the same list. A small label indicates the active source (Local DB / Web).

## Slice 4 — Prompt for uncalculable amounts

**Decision:** Flag + prompt, but keep showing the estimate.

**Backend (`combineNutrition`):**
- Add per-item flag `needsAmount: true` when a food **matched** but no reliable weight could be derived — specifically when the chosen scale path set `approx = true` because `grams == null` (bare count against a per-mass / non-matching-unit basis). Lines that matched cleanly, manual entries, excluded lines, and unmatched lines do **not** set `needsAmount`.
- The estimate is still computed and added to totals, exactly as today. `estimated` global flag unchanged.

**Frontend:**
- `needsAmount` flows through `data.items` into the editor `Row`.
- Row shows a **"⚠ Needs amount"** badge and surfaces the existing `AmountPanel` (qty + unit → `editor.setAmount`) as the suggested action. Once the user sets a convertible amount, the override removes the ambiguity on the next `/get-nutrition` recompute.
- `NutritionCard` note reflects the count of lines needing an amount (e.g. `Estimated · 7/8 matched · 1 needs an amount`).

## Slice 5 — Search saved recipes

**Decision:** Server-backed endpoint, matching title **and** ingredients.

**Backend:**
- New authed route `GET /saved-recipes/search?q=` in `savedRecipeRoutes` / `savedRecipeHandlers`.
- Handler loads the requesting user's rows (`where: { userId }`), runs Fuse over `{ title, ingredients }` (ingredients deserialized to text), returns `{ recipes: [...] }` of `deserializeRecipe` results. Empty/whitespace `q` returns the full list (parity with current page behavior).

**Frontend:**
- `api/savedRecipes.js`: `searchSavedRecipes(q)` → `GET /saved-recipes/search?q=...`.
- `SavedPage` gets a debounced search input; non-empty query swaps the rendered list for search results, empty query shows the full favorites list. Loading/empty states reuse existing UI patterns (`Spinner`, empty message).

## Cross-cutting concerns

- **Mobile-first** layout for all new/changed UI (editor row match line, badge, web-search button, saved search box). Run the `ui-ux-pro-max` skill during implementation of these UI pieces.
- **Testing (TDD):**
  - `combineNutrition` — `needsAmount` set/unset across the calc branches.
  - `fatsecretClient.searchFoods` — array and single-result responses both map correctly.
  - `/search-foods` — `source=web` routes to FatSecret; default stays USDA.
  - saved-recipe search handler — title match, ingredient match, empty query → full list, user scoping.
  - Frontend: `IngredientsEditor`/`Row` match line + needs-amount badge; `ReplacePanel` web-search toggle; `SavedPage` search box.
- **Error handling:** web search failure shows the existing "Search unavailable" state; saved search failure falls back to the full list with an inline notice.

## Out of scope

- Persisting which source (local/web) was used per ingredient beyond the existing `food` override fields.
- Caching/rate-limiting of food or saved-recipe search (tracked separately as future-plans item #1).
- Changing the auto-match algorithm or scoring.
