# Plan: Crowd-Sourced Ingredient Corrections (future-plans #10 partial)

**Spec:** `docs/superpowers/specs/2026-06-05-crowd-corrections-design.md`
**Branch:** feat/persisted-nutrition (extends the persisted-nutrition work)

## Slice 1 — Schema
- Add `UrlCorrection` model and `originalIngredients String?` column to
  `SavedRecipe` in `backend/prisma/schema.prisma`.
- `npx prisma db push --skip-generate` then `npx prisma generate`.

## Slice 2 — Correction detection + aggregation helpers
- **Tests** (`backend/recipes/__tests__/corrections.test.js`):
  - `detectCorrections(originalTexts, richItems)`:
    - returns text correction when text changed
    - returns replace/amount/exclude/manual for each nutrition override type
    - returns empty array when nothing changed
    - skips lines without a sourceUrl (tested via the handler, not here)
  - `aggregateCorrections(rows, totalSaves, threshold)`:
    - returns empty when below threshold
    - returns most-common correction when ≥60% of saves corrected a line
    - ties broken by first occurrence (stable)
    - threshold denominator is `totalSaves` not correction count
- **Code** (`backend/recipes/corrections.js`):
  - `detectCorrections(originalTexts, richItems)` → array of
    `{ ingredientIndex, originalText, correctionType, correctionData }`
  - `aggregateCorrections(rows, totalSaves, threshold=0.60)` → array of
    override objects ready to merge into a scrape result

## Slice 3 — Record corrections on save/update
- **Tests** (add to `backend/recipes/__tests__/savedRecipeHandlers.test.js`):
  - create with sourceUrl + overrides → upserts UrlCorrection rows
  - create without sourceUrl → no UrlCorrection rows written
  - update that changes an ingredient → upserts new correction
  - update that removes an override → upserts new correction (now empty for that line)
- **Code** (`backend/recipes/savedRecipeHandlers.js`):
  - Thread `prisma` into a new `recordCorrections(prisma, userId, sourceUrl, original, rich)`
    call in `makeCreateHandler` and `makeUpdateHandler`.
  - On create: `originalIngredients` = the ingredient texts at save time (baseline).
  - On update: fetch `originalIngredients` from the stored row as baseline;
    pass current rich items to `detectCorrections`; upsert results.
  - Store `originalIngredients` in the serialized row on create only.

## Slice 4 — Apply crowd corrections at scrape time
- **Tests** (`backend/__tests__/scrapeCorrections.test.js`):
  - `/scrape-recipe` with a URL that has ≥60% corrections returns `crowdOverrides`
  - below threshold → `crowdOverrides` is empty
  - no prior saves → `crowdOverrides` is empty
  - text corrections modify the `ingredients` array in the response
- **Code** (`backend/server.js`, `POST /scrape-recipe`):
  - After `scrapeRecipe(url)`, query `SavedRecipe.count` + `UrlCorrection.findMany`
    for the URL.
  - Call `aggregateCorrections(corrections, totalSaves)`.
  - Apply text corrections directly to `recipe.ingredients`/`recipe.ingredientsData`.
  - Attach remaining corrections as `recipe.crowdOverrides`.
  - Return augmented recipe.

## Slice 5 — Frontend applies crowd overrides
- **Tests** (add to `frontend/src/hooks/__tests__/useRecipeEditor.test.js`):
  - `useRecipeEditor(recipe, { initialOverrides })` seeds nutrition state from
    initialOverrides (replace/amount/exclude/manual applied to matching items).
- **Code**:
  - `useRecipeEditor` accepts optional `{ initialOverrides }` second arg.
    On mount, apply each override via the existing `patchNutrition` logic.
  - `RecipeDetailPage` / scrape page: pass `recipe.crowdOverrides` as
    `initialOverrides` to `useRecipeEditor`.

## Verification
- `cd backend && node --test` — all suites green.
- `cd frontend && npx vitest run` — all suites green.
- Manual: two test accounts save the same URL with the same food replacement
  on ingredient #1 → third user scraping the URL gets it pre-applied.
