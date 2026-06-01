# USDA Nutrition Lookup via Prisma + MSSQL — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design)

## Goal

Replace the unpredictable FatSecret free-text search as the *primary* nutrition
source with a local, controllable USDA FoodData Central dataset stored in MSSQL
and queried via Prisma. FatSecret remains a fallback. This eliminates noisy
matches (e.g. "Mint Julep" returned for "basil and/or mint leaves") by giving us
full control over the searchable corpus and the ranking.

## Background

The current pipeline parses each ingredient line, calls an injected
`searchFood(name)` that hits FatSecret's `foods.search` (OAuth 1.0), takes the
first result, parses its `food_description` macro string, scales by amount, and
sums into totals. The weak point is FatSecret's search: we cannot control which
food ranks first, and branded/compound results inflate or distort the numbers.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Dataset | USDA **SR Legacy + Foundation Foods** (~8,000 whole/raw ingredients) |
| Search location | **In-memory Fuse.js** index, loaded from MSSQL at startup |
| FatSecret | **Keep as fallback** (USDA first, FatSecret on miss) |
| Data import | **Include an import/seed script** (user creates the empty DB; script fills it) |
| ORM / DB | **Prisma** with `sqlserver` provider → local MSSQL |
| Macro basis | USDA-native **per 100g** (downstream unit→gram logic unchanged) |

## Architecture

### Integration seam (why `combine.js` does not change)

`combineNutrition(ingredients, servings, { searchFood })` already takes an
injected `searchFood(name)` returning `{ food_name, food_description }` or
`null`, where `food_description` is a string of the form:

```
Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g
```

Both providers return this identical shape. `combine.js` and
`parseFoodDescription.js` are unchanged; they never know which provider answered.

### Data flow (request time)

```
ingredient line
  → parseIngredient        (quantity, unit, name)
  → cleanForSearch         (strip prep words / compound options)
  → resolver.searchFood    (USDA Fuse hit, else FatSecret fallback)
  → parseFoodDescription   (macro string → numbers, per-100g basis)
  → scale by grams         (existing units.js + combine.js logic)
  → sum into totals / perServing
```

Everything after the resolver is existing, tested code.

### Startup flow

1. `server.js` instantiates the Prisma client.
2. `usdaClient` loads all `Food` rows via `prisma.food.findMany()` (~8k) into
   memory and builds a Fuse.js index on `description`.
3. `server.js` composes `makeFoodResolver({ usdaSearch, fatsecretSearch })` and
   injects the resulting `searchFood` into the `/get-nutrition` handler.
4. If the DB is unreachable at boot, log a warning and run **FatSecret-only** so
   the app still starts.

## Components

### `backend/prisma/schema.prisma` (new)

One flattened model; macros per 100g.

```prisma
datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Food {
  fdcId       Int     @id
  description String
  dataType    String  // "sr_legacy_food" | "foundation_food"
  category    String?
  calories    Float?  // kcal per 100g
  protein     Float?  // g per 100g
  fat         Float?  // g per 100g
  carbs       Float?  // g per 100g

  @@index([dataType])
}
```

> `description` may exceed the default NVARCHAR length for some entries; the plan
> will set an explicit length (e.g. `@db.NVarChar(500)`) if migration requires it.

### `backend/prisma/importUsda.js` (new) — seed script

- Input: a local folder containing the extracted USDA FoodData Central CSV bulk
  download (`food.csv`, `food_nutrient.csv`, and the SR Legacy / Foundation
  type tables). Folder path via CLI arg or env var.
- Stream `food.csv`; keep rows whose `data_type` is `sr_legacy_food` or
  `foundation_food`.
- Stream `food_nutrient.csv`; build `fdc_id → { calories, protein, fat, carbs }`
  using USDA nutrient IDs:
  - **Energy (kcal): `1008`** (fallback `2047`/`2048` Atwater if `1008` absent)
  - **Protein: `1003`**
  - **Total lipid (fat): `1004`**
  - **Carbohydrate, by difference: `1005`**
- Flatten to one row per food; batch `createMany` (or upsert) into MSSQL.
- The CSV-row → flattened-food transform is a **pure exported function** so it
  can be unit-tested with small fixtures; only the DB write is impure.
- Exposed via `npm run db:import`.

### `backend/nutrition/usdaClient.js` (new)

- `loadFoods(prisma)` → `prisma.food.findMany()`.
- `buildIndex(foods)` → Fuse.js instance keyed on `description` (threshold tuned
  for ingredient names; mirrors existing recipe-search config).
- `formatDescription(food)` → the `"Per 100g - Calories: … | Fat: … | Carbs: … | Protein: …"` string.
- `makeUsdaSearch(index)` → `searchFood(name)` returning
  `{ food_name, food_description }` from the top Fuse hit, or `null` on no match.
- Pure functions (`formatDescription`, search-over-injected-index) are testable
  without a DB by passing a fake foods array.

### `backend/nutrition/foodResolver.js` (new)

- `makeFoodResolver({ usdaSearch, fatsecretSearch })` → `searchFood(name)`:
  - Try `usdaSearch(name)`; if it returns a truthy match, use it.
  - On `null` or thrown error, try `fatsecretSearch(name)`.
  - If both miss, return `null`.
- Pure composition; fully testable with two fake provider functions.

### `backend/server.js` (modify)

- Import and instantiate `@prisma/client`.
- At boot: load USDA foods, build the index, compose the resolver. Wrap in
  try/catch — on DB failure, fall back to a FatSecret-only resolver and warn.
- Inject the composed `searchFood` into the existing `/get-nutrition` handler
  (replacing the direct `searchFood` import from `fatsecretClient`).

### `backend/package.json` / `.env` / `.env.example` (modify)

- Dependencies: `@prisma/client`; dev: `prisma`.
- Scripts: `prisma:generate` (`prisma generate`), `db:import` (`node prisma/importUsda.js`).
- `DATABASE_URL` example:
  `sqlserver://localhost:1433;database=recipe_nutrition;user=sa;password=...;encrypt=true;trustServerCertificate=true`

## Testing

| Unit | Strategy |
|------|----------|
| `usdaClient` | Inject a fake foods array (no DB). Test `formatDescription` output and Fuse ranking / top-hit selection. |
| `foodResolver` | Fake both providers. Assert USDA-first, fallback on `null`, fallback on thrown error, `null` when both miss. |
| `importUsda` | Test the pure CSV-row → flattened-food transform with small fixtures (incl. the Energy `1008`→`2047` fallback). DB write smoke-tested manually after a real import. |
| `combine.js` | Unchanged — still injects a fake `searchFood`. |

All backend tests run under `node --test`.

## Out of Scope

- Branded foods and FNDDS survey foods (corpus is SR Legacy + Foundation only).
- USDA portion/serving-size conversions (we keep per-100g + existing
  `units.js` gram conversion).
- Provisioning the MSSQL server/database (the user does this; the script seeds
  an existing empty DB).
- Frontend changes (the response contract is unchanged).

## Success Criteria

- After `npm run db:import`, the `Food` table holds ~8,000 SR Legacy +
  Foundation rows with non-null macros for the four nutrients.
- `/get-nutrition` returns combined totals sourced from USDA for common
  ingredients, with FatSecret only filling genuine USDA misses.
- The earlier failure cases (basil/mint, "Freshly ground black pepper",
  compound "spaghetti or bucatini") resolve to sensible USDA foods.
- App still boots (FatSecret-only) when the DB is down.
