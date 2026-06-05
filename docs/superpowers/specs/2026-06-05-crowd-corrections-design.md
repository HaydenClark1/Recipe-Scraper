# Crowd-Sourced Ingredient Corrections (future-plans #10 partial)

**Date:** 2026-06-05
**Status:** Approved (design)

## Summary

When multiple users scrape the same recipe URL and correct the same ingredient
(nutrition override or text edit), those corrections should be automatically
applied to future users scraping that URL — so nobody has to fix the same
scraping mistake twice. A correction is surfaced when ≥60% of users who saved
a recipe from a given URL corrected a specific ingredient line.

## Decisions

- **Matching:** by position (index). Ingredient #2 for user A matches ingredient
  #2 for user B. Same URL → same scraper output → same ordering.
- **Correction value:** most common specific override wins. If 4/6 users replaced
  ingredient #2 with "Egg, whole, raw", that replacement is pre-applied.
- **What counts:** nutrition overrides (replace food, set amount, exclude, manual)
  AND ingredient text edits.

## Data model

### New table: `UrlCorrection`

```prisma
model UrlCorrection {
  id              Int      @id @default(autoincrement())
  sourceUrl       String   @db.VarChar(1000)
  ingredientIndex Int
  originalText    String   @db.VarChar(500)
  correctionType  String   @db.VarChar(20)  // replace|amount|exclude|manual|text
  correctionData  String?  // JSON payload of the specific correction value
  userId          Int
  createdAt       DateTime @default(now())

  @@unique([sourceUrl, ingredientIndex, userId])
  @@index([sourceUrl])
}
```

One row per user per ingredient line per URL. The unique constraint means a
user's latest correction wins (upsert) rather than accumulating duplicates.

### New column: `originalIngredients` on `SavedRecipe`

```prisma
originalIngredients String?  // JSON array of ingredient texts as scraped, never updated
```

Captured once at create time from the scraper output. Used as the baseline to
detect what the user changed. Never overwritten on update — it represents what
the scraper produced, not what the user edited it to.

## Recording corrections (create/update handlers)

After serializing a recipe, compare each rich ingredient item against the stored
`originalIngredients` (fetched from the existing row on update):

- **text correction:** `item.text !== original[index]` → type `text`, data `{ text: item.text }`
- **nutrition corrections:** inspect `item.nutrition`:
  - `food` present → type `replace`, data `{ foodName, foodDescription, fdcId }`
  - `amount` present → type `amount`, data `{ quantity, unit }`
  - `excluded: true` → type `exclude`, data `null`
  - `manual` present → type `manual`, data `{ calories, fat, carbs, protein }`

Each detected correction is upserted into `UrlCorrection` (by
`sourceUrl + ingredientIndex + userId`). Only runs when `sourceUrl` is present.

## Aggregation & applying corrections (scrape endpoint)

After scraping a URL, before returning:

1. `totalSaves = count(SavedRecipe where sourceUrl = url)`
2. If `totalSaves === 0`, return as-is.
3. Fetch all `UrlCorrection` rows for this URL.
4. Group by `ingredientIndex`. For each group:
   - If `group.length / totalSaves < 0.60` → skip (below threshold).
   - Find the most common `(correctionType, correctionData)` pair in the group.
   - Build an override from it (same shape as the existing `overrides` array the
     frontend already handles).
5. Return the scrape result with `crowdOverrides` array merged in. The frontend
   passes these as initial overrides to `useRecipeEditor` — no new UI needed.

The `crowdOverrides` use the same override shapes as `deriveOverrides`:
`{ index, type: 'replace'|'amount'|'exclude'|'manual', ...fields }`.
Text corrections update the scraped ingredient text directly in the returned
`ingredients` array (since text isn't an override, it's the base line).

## Frontend

`/scrape-recipe` now returns `{ ...recipe, crowdOverrides: [...] }`. The scrape
page passes `crowdOverrides` into `RecipeContext` alongside the recipe. 
`RecipeDetailPage` seeds `useRecipeEditor` with them as `initialOverrides` — a
new optional prop on the hook. No visible UI change; corrections are just
pre-filled.

## Cross-cutting

- **Privacy:** corrections are stored per `userId` but only the aggregate is
  ever served. Individual user choices are never exposed.
- **Threshold denominator:** `totalSaves` (all saves for the URL), not just
  saves with corrections. This is conservative — if only 2 people saved a
  recipe, 60% = 2/2, so both must agree before it fires.
- **Testing (TDD):**
  - Schema: UrlCorrection upsert, unique constraint holds.
  - `detectCorrections(original, rich)` → correct set of correction objects.
  - `aggregateCorrections(corrections, totalSaves, threshold)` → only returns
    entries above 60%, with the most common value.
  - Save handler records corrections when sourceUrl is present; skips when absent.
  - Scrape endpoint applies crowd overrides when threshold met; returns clean
    result when below threshold or no saves.
  - Frontend: `useRecipeEditor` accepts and applies `initialOverrides`.
- **Migration:** nullable columns + new table, `prisma db push`. Existing rows
  get `originalIngredients = null`; corrections only accumulate going forward.

## Out of scope

- Scrape result caching by URL (the "valid if scraped < 1 day ago" part of #10).
- Showing users a "community suggested" badge on pre-applied corrections.
- Weighted voting (one user = one vote, no weighting).
