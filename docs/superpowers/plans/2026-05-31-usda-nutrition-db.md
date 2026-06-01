# USDA Nutrition DB (Prisma + MSSQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make USDA FoodData Central (stored in local MSSQL via Prisma, searched in-memory with Fuse.js) the primary nutrition source, with FatSecret kept only as a fallback.

**Architecture:** A new `usdaClient` loads ~8k SR Legacy + Foundation foods from MSSQL at startup and builds a Fuse index. A `foodResolver` composes USDA-first / FatSecret-fallback into a single `searchFood(name)` that satisfies the existing injected contract — so `combine.js` and `parseFoodDescription.js` are untouched. An import script seeds the user-created empty DB from the USDA CSV bulk download.

**Tech Stack:** Node/Express, Prisma (`sqlserver` provider), MSSQL, Fuse.js (already a dependency), `csv-parser` (already a dependency), `node --test`.

**Spec:** `docs/superpowers/specs/2026-05-31-usda-nutrition-db-design.md`

---

## File Structure

**New:**
- `backend/prisma/schema.prisma` — Prisma datasource + `Food` model.
- `backend/prisma/importUsda.js` — USDA CSV → MSSQL seed script. Pure transform (`pickEnergy`, `buildFoodRow`) + impure streaming/DB shell.
- `backend/nutrition/usdaClient.js` — `loadFoods`, `buildIndex`, `formatDescription`, `makeUsdaSearch`.
- `backend/nutrition/foodResolver.js` — `makeFoodResolver({ usdaSearch, fatsecretSearch })`.
- `backend/nutrition/__tests__/importUsda.test.js`
- `backend/nutrition/__tests__/usdaClient.test.js`
- `backend/nutrition/__tests__/foodResolver.test.js`

> Note: `importUsda.js` lives in `prisma/` but its tests live in `nutrition/__tests__/` so the existing `node --test` glob (which discovers `**/__tests__/`) picks them up. The test imports it via `require('../../prisma/importUsda')`.

**Modified:**
- `backend/server.js` — instantiate Prisma, build USDA index at boot, compose resolver, inject into `/get-nutrition`.
- `backend/package.json` — add `@prisma/client` dep, `prisma` dev dep, `prisma:generate` + `db:import` scripts.
- `backend/.env` / `backend/.env.example` — add `DATABASE_URL`.

**Contract (unchanged, both providers return this):**
```js
// searchFood(name) resolves to this shape or null
{ food_name: "Zucchini, raw", food_description: "Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g" }
```

---

## Task 1: Prisma setup, schema, and DB push

**Files:**
- Create: `backend/prisma/schema.prisma`
- Modify: `backend/package.json`
- Modify: `backend/.env`, `backend/.env.example`

- [ ] **Step 1: Install Prisma**

From `backend/`:
```bash
npm install @prisma/client
npm install -D prisma
```
Expected: `@prisma/client` in `dependencies`, `prisma` in `devDependencies`.

- [ ] **Step 2: Create the Prisma schema**

Create `backend/prisma/schema.prisma`:
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
  description String  @db.NVarChar(500)
  dataType    String  @db.NVarChar(50)
  category    String? @db.NVarChar(100)
  calories    Float?  // kcal per 100g
  protein     Float?  // g per 100g
  fat         Float?  // g per 100g
  carbs       Float?  // g per 100g

  @@index([dataType])
}
```

- [ ] **Step 3: Add scripts to `package.json`**

In `backend/package.json`, set the `scripts` block to:
```json
  "scripts": {
    "test": "node --test",
    "prisma:generate": "prisma generate",
    "db:import": "node prisma/importUsda.js"
  },
```

- [ ] **Step 4: Add `DATABASE_URL` to env files**

Append to `backend/.env.example`:
```
# Local MSSQL for USDA nutrition data
DATABASE_URL="sqlserver://localhost:1433;database=recipe_nutrition;user=sa;password=your_password_here;encrypt=true;trustServerCertificate=true"
```
Append to `backend/.env` (replace with your real local MSSQL credentials — the DB must already exist, empty is fine):
```
DATABASE_URL="sqlserver://localhost:1433;database=recipe_nutrition;user=sa;password=...;encrypt=true;trustServerCertificate=true"
```

- [ ] **Step 5: Generate the client and create the table**

From `backend/` (requires the empty DB to exist and be reachable):
```bash
npx prisma generate
npx prisma db push
```
Expected: `prisma generate` writes the client into `node_modules/@prisma/client`; `db push` creates a `Food` table in your MSSQL database. If `db push` cannot connect, fix `DATABASE_URL` / confirm the DB exists before continuing.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/package.json backend/package-lock.json backend/.env.example
git commit -m "chore: add Prisma + MSSQL Food schema for USDA nutrition"
```

---

## Task 2: Import script — pure transform (`pickEnergy`, `buildFoodRow`)

**Files:**
- Create: `backend/prisma/importUsda.js` (transform functions + exports only this task)
- Test: `backend/nutrition/__tests__/importUsda.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/importUsda.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { pickEnergy, buildFoodRow } = require('../../prisma/importUsda')

test('pickEnergy prefers nutrient 1008, then 2047, then 2048', () => {
  assert.strictEqual(pickEnergy({ 1008: 52, 2047: 60 }), 52)
  assert.strictEqual(pickEnergy({ 2047: 60 }), 60)
  assert.strictEqual(pickEnergy({ 2048: 70 }), 70)
  assert.strictEqual(pickEnergy({}), null)
})

test('buildFoodRow flattens a food + nutrient map into a Prisma row', () => {
  const food = {
    fdc_id: '123',
    data_type: 'sr_legacy_food',
    description: 'Zucchini, raw',
    food_category_id: '11',
  }
  const nutrients = { 1008: 16, 1003: 1.21, 1004: 0.18, 1005: 3.35 }
  assert.deepStrictEqual(buildFoodRow(food, nutrients), {
    fdcId: 123,
    description: 'Zucchini, raw',
    dataType: 'sr_legacy_food',
    category: '11',
    calories: 16,
    protein: 1.21,
    fat: 0.18,
    carbs: 3.35,
  })
})

test('buildFoodRow uses null for missing macros and empty category', () => {
  const food = { fdc_id: '9', data_type: 'foundation_food', description: 'Mystery', food_category_id: '' }
  assert.deepStrictEqual(buildFoodRow(food, {}), {
    fdcId: 9,
    description: 'Mystery',
    dataType: 'foundation_food',
    category: null,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test nutrition/__tests__/importUsda.test.js
```
Expected: FAIL — `Cannot find module '../../prisma/importUsda'`.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/prisma/importUsda.js`:
```js
// USDA FoodData Central nutrient IDs (values are per 100g)
const ENERGY_IDS = [1008, 2047, 2048] // kcal: Energy, then Atwater General/Specific
const PROTEIN_ID = 1003
const FAT_ID = 1004
const CARB_ID = 1005

function pickEnergy(nutrientMap) {
  for (const id of ENERGY_IDS) {
    if (nutrientMap[id] != null) return nutrientMap[id]
  }
  return null
}

function buildFoodRow(food, nutrientMap) {
  return {
    fdcId: Number(food.fdc_id),
    description: food.description,
    dataType: food.data_type,
    category: food.food_category_id ? String(food.food_category_id) : null,
    calories: pickEnergy(nutrientMap),
    protein: nutrientMap[PROTEIN_ID] ?? null,
    fat: nutrientMap[FAT_ID] ?? null,
    carbs: nutrientMap[CARB_ID] ?? null,
  }
}

module.exports = { pickEnergy, buildFoodRow, ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/importUsda.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/importUsda.js backend/nutrition/__tests__/importUsda.test.js
git commit -m "feat: add pure USDA CSV->row transform for nutrition import"
```

---

## Task 3: Import script — CSV streaming + DB write shell

**Files:**
- Modify: `backend/prisma/importUsda.js` (add the streaming/DB runner; keep the pure exports from Task 2)

- [ ] **Step 1: Add the import runner**

In `backend/prisma/importUsda.js`, add these requires at the top (above the nutrient-id constants):
```js
const fs = require('fs')
const path = require('path')
const csvParser = require('csv-parser')
const { PrismaClient } = require('@prisma/client')
```

Then append the runner below the existing `module.exports` line (and update the exports — see Step 2):
```js
const WANTED_TYPES = new Set(['sr_legacy_food', 'foundation_food'])
const WANTED_NUTRIENTS = new Set([...ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID].map(String))

function streamCsv(filePath, onRow) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', onRow)
      .on('end', resolve)
      .on('error', reject)
  })
}

async function importUsda(dataDir, prisma) {
  // Pass 1: collect wanted foods (SR Legacy + Foundation)
  const foods = new Map() // fdc_id (string) -> food row
  await streamCsv(path.join(dataDir, 'food.csv'), (row) => {
    if (WANTED_TYPES.has(row.data_type)) foods.set(row.fdc_id, row)
  })
  console.log(`Found ${foods.size} SR Legacy + Foundation foods`)

  // Pass 2: collect the 4 nutrients for those foods only
  const nutrients = new Map() // fdc_id (string) -> { [nutrientId]: amount }
  await streamCsv(path.join(dataDir, 'food_nutrient.csv'), (row) => {
    if (!foods.has(row.fdc_id)) return
    if (!WANTED_NUTRIENTS.has(row.nutrient_id)) return
    const amount = Number(row.amount)
    if (!Number.isFinite(amount)) return
    const map = nutrients.get(row.fdc_id) || {}
    map[Number(row.nutrient_id)] = amount
    nutrients.set(row.fdc_id, map)
  })

  // Build rows
  const rows = []
  for (const [fdcId, food] of foods) {
    rows.push(buildFoodRow(food, nutrients.get(fdcId) || {}))
  }

  // Wipe + batch insert
  await prisma.food.deleteMany()
  const BATCH = 1000
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.food.createMany({ data: rows.slice(i, i + BATCH) })
  }
  console.log(`Imported ${rows.length} foods into MSSQL`)
  return rows.length
}

// CLI entry: node prisma/importUsda.js <path-to-extracted-usda-csv-dir>
if (require.main === module) {
  const dataDir = process.argv[2] || process.env.USDA_DATA_DIR
  if (!dataDir) {
    console.error('Usage: node prisma/importUsda.js <path-to-extracted-usda-csv-dir>')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  importUsda(dataDir, prisma)
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('Import failed:', err)
      return prisma.$disconnect().finally(() => process.exit(1))
    })
}
```

- [ ] **Step 2: Update the exports**

Change the `module.exports` line in `backend/prisma/importUsda.js` to also export the runner:
```js
module.exports = { pickEnergy, buildFoodRow, importUsda, ENERGY_IDS, PROTEIN_ID, FAT_ID, CARB_ID }
```

- [ ] **Step 3: Re-run the unit tests (no regression)**

From `backend/`:
```bash
node --test nutrition/__tests__/importUsda.test.js
```
Expected: PASS (3 tests) — the pure transform is unchanged.

- [ ] **Step 4: Smoke-test a real import (manual)**

Download the USDA FoodData Central "Full Download of All Data Types" (or the SR Legacy + Foundation CSV sets) from https://fdc.nal.usda.gov/download-datasets.html and extract so that `food.csv` and `food_nutrient.csv` sit in one folder. Then from `backend/`:
```bash
node prisma/importUsda.js "C:\\path\\to\\usda\\csv"
```
Expected: logs `Found ~8000 ... foods` then `Imported ~8000 foods into MSSQL`. Verify with `npx prisma studio` (the `Food` table has rows with non-null calories/protein/fat/carbs).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/importUsda.js
git commit -m "feat: add USDA CSV streaming import into MSSQL via Prisma"
```

---

## Task 4: `usdaClient.js` — description formatting + Fuse search

**Files:**
- Create: `backend/nutrition/usdaClient.js`
- Test: `backend/nutrition/__tests__/usdaClient.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/usdaClient.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { formatDescription, buildIndex, makeUsdaSearch } = require('../usdaClient')

const FOODS = [
  { fdcId: 1, description: 'Zucchini, raw', calories: 16, fat: 0.18, carbs: 3.35, protein: 1.21 },
  { fdcId: 2, description: 'Wheat flour, white, all-purpose', calories: 364, fat: 0.98, carbs: 76.31, protein: 10.33 },
]

test('formatDescription builds a Per 100g macro string', () => {
  assert.strictEqual(
    formatDescription(FOODS[0]),
    'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g'
  )
})

test('formatDescription treats null macros as 0', () => {
  assert.strictEqual(
    formatDescription({ description: 'X', calories: null, fat: null, carbs: null, protein: null }),
    'Per 100g - Calories: 0kcal | Fat: 0g | Carbs: 0g | Protein: 0g'
  )
})

test('makeUsdaSearch returns the top fuzzy match in the provider contract', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS))
  const r = await search('zucchini')
  assert.strictEqual(r.food_name, 'Zucchini, raw')
  assert.strictEqual(r.food_description, 'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g')
})

test('makeUsdaSearch returns null when nothing matches', async () => {
  const search = makeUsdaSearch(buildIndex(FOODS))
  assert.strictEqual(await search('zzzzzzzz'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test nutrition/__tests__/usdaClient.test.js
```
Expected: FAIL — `Cannot find module '../usdaClient'`.

- [ ] **Step 3: Write the implementation**

Create `backend/nutrition/usdaClient.js`:
```js
const Fuse = require('fuse.js')

// USDA macros are stored per 100g; emit the same string shape FatSecret returns
// so parseFoodDescription can read it unchanged.
function formatDescription(food) {
  const n = (v) => (v == null ? 0 : v)
  return `Per 100g - Calories: ${n(food.calories)}kcal | Fat: ${n(food.fat)}g | Carbs: ${n(food.carbs)}g | Protein: ${n(food.protein)}g`
}

function buildIndex(foods) {
  return new Fuse(foods, {
    keys: ['description'],
    threshold: 0.3,
    ignoreLocation: true,
  })
}

function makeUsdaSearch(index) {
  return async function searchFood(name) {
    const hits = index.search(name)
    if (!hits.length) return null
    const food = hits[0].item
    return { food_name: food.description, food_description: formatDescription(food) }
  }
}

async function loadFoods(prisma) {
  return prisma.food.findMany()
}

module.exports = { formatDescription, buildIndex, makeUsdaSearch, loadFoods }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/usdaClient.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/usdaClient.js backend/nutrition/__tests__/usdaClient.test.js
git commit -m "feat: add USDA in-memory Fuse search client"
```

---

## Task 5: `foodResolver.js` — USDA-first / FatSecret fallback

**Files:**
- Create: `backend/nutrition/foodResolver.js`
- Test: `backend/nutrition/__tests__/foodResolver.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/nutrition/__tests__/foodResolver.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { makeFoodResolver } = require('../foodResolver')

const USDA_HIT = { food_name: 'Zucchini, raw', food_description: 'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g' }
const FS_HIT = { food_name: 'Zucchini', food_description: 'Per 100g - Calories: 17kcal | Fat: 0.3g | Carbs: 3g | Protein: 1g' }

test('uses USDA when it returns a match (FatSecret not called)', async () => {
  let fsCalled = false
  const resolve = makeFoodResolver({
    usdaSearch: async () => USDA_HIT,
    fatsecretSearch: async () => { fsCalled = true; return FS_HIT },
  })
  assert.deepStrictEqual(await resolve('zucchini'), USDA_HIT)
  assert.strictEqual(fsCalled, false)
})

test('falls back to FatSecret when USDA returns null', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => null,
    fatsecretSearch: async () => FS_HIT,
  })
  assert.deepStrictEqual(await resolve('zucchini'), FS_HIT)
})

test('falls back to FatSecret when USDA throws', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => { throw new Error('index down') },
    fatsecretSearch: async () => FS_HIT,
  })
  assert.deepStrictEqual(await resolve('zucchini'), FS_HIT)
})

test('returns null when both miss', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => null,
    fatsecretSearch: async () => null,
  })
  assert.strictEqual(await resolve('xyz'), null)
})

test('returns null when USDA misses and no FatSecret provided', async () => {
  const resolve = makeFoodResolver({ usdaSearch: async () => null })
  assert.strictEqual(await resolve('xyz'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test nutrition/__tests__/foodResolver.test.js
```
Expected: FAIL — `Cannot find module '../foodResolver'`.

- [ ] **Step 3: Write the implementation**

Create `backend/nutrition/foodResolver.js`:
```js
// Compose providers into one searchFood(name): try USDA, fall back to FatSecret.
function makeFoodResolver({ usdaSearch, fatsecretSearch }) {
  return async function searchFood(name) {
    try {
      const usda = await usdaSearch(name)
      if (usda) return usda
    } catch {
      // fall through to fallback
    }
    if (!fatsecretSearch) return null
    try {
      return await fatsecretSearch(name)
    } catch {
      return null
    }
  }
}

module.exports = { makeFoodResolver }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test nutrition/__tests__/foodResolver.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/nutrition/foodResolver.js backend/nutrition/__tests__/foodResolver.test.js
git commit -m "feat: add USDA-first FatSecret-fallback food resolver"
```

---

## Task 6: Wire the resolver into `server.js`

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Add the new requires**

In `backend/server.js`, find the existing nutrition requires:
```js
const { combineNutrition } = require("./nutrition/combine");
const { searchFood } = require("./nutrition/fatsecretClient");
```
Replace them with:
```js
const { combineNutrition } = require("./nutrition/combine");
const { searchFood: fatsecretSearch } = require("./nutrition/fatsecretClient");
const { loadFoods, buildIndex, makeUsdaSearch } = require("./nutrition/usdaClient");
const { makeFoodResolver } = require("./nutrition/foodResolver");
const { PrismaClient } = require("@prisma/client");
```

- [ ] **Step 2: Add the Prisma client and resolver initializer**

In `backend/server.js`, immediately after `const app = express();` add:
```js
const prisma = new PrismaClient();

// Default resolver: FatSecret-only (used until the USDA index loads, and if it fails).
let resolveFood = makeFoodResolver({ usdaSearch: async () => null, fatsecretSearch });

async function initNutrition() {
  try {
    const foods = await loadFoods(prisma);
    const index = buildIndex(foods);
    resolveFood = makeFoodResolver({ usdaSearch: makeUsdaSearch(index), fatsecretSearch });
    console.log(`USDA nutrition index loaded: ${foods.length} foods`);
  } catch (err) {
    console.warn("USDA index unavailable, using FatSecret-only:", err.message);
  }
}
```

- [ ] **Step 3: Call the initializer during startup**

In `backend/server.js`, find the startup IIFE:
```js
(async () => {
  jsonData = await loadCSVFromGitHub();
  console.log(jsonData);
  const port = process.env.PORT || 7000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();
```
Add the `initNutrition()` call after the CSV load:
```js
(async () => {
  jsonData = await loadCSVFromGitHub();
  console.log(jsonData);
  await initNutrition();
  const port = process.env.PORT || 7000;
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
})();
```

- [ ] **Step 4: Use the resolver in the endpoint**

In `backend/server.js`, in the `/get-nutrition` handler, change the `combineNutrition` call from:
```js
    const result = await combineNutrition(ingredients, servings, { searchFood });
```
to:
```js
    const result = await combineNutrition(ingredients, servings, { searchFood: resolveFood });
```

- [ ] **Step 5: Start the server and smoke-test**

From `backend/` (with the DB seeded from Task 3 and real `.env`):
```bash
node server.js
```
Expected log: `USDA nutrition index loaded: ~8000 foods` then `Server running at http://localhost:7000`. In a second terminal:
```bash
curl -s -X POST http://localhost:7000/get-nutrition -H "Content-Type: application/json" -d "{\"ingredients\":[\"2 pounds zucchini\",\"1 cup fresh basil and/or mint leaves\"],\"servings\":\"4\"}"
```
Expected: JSON totals where the breakdown's matched foods are USDA descriptions (e.g. "Zucchini, raw", "Basil, fresh") — no "Mint Julep". Each `items[]` entry is `matched: true` when USDA has the food.

- [ ] **Step 6: Confirm DB-down fallback (manual)**

Temporarily set a bad `DATABASE_URL` in `.env`, run `node server.js`. Expected: warning `USDA index unavailable, using FatSecret-only: ...` and the server still starts and serves `/get-nutrition` via FatSecret. Restore the correct `DATABASE_URL` afterward.

- [ ] **Step 7: Commit**

```bash
git add backend/server.js
git commit -m "feat: serve nutrition from USDA index with FatSecret fallback"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

From `backend/`:
```bash
npm test
```
Expected: all nutrition tests (units, parseIngredient, parseFoodDescription, fatsecretClient, combine, importUsda, usdaClient, foodResolver) PASS, plus existing scraper tests.

- [ ] **Step 2: End-to-end check in the app**

- Backend: `node server.js` (DB seeded, real `.env`) — confirm the USDA index-loaded log line.
- Frontend: from `frontend/`, set `VITE_API_URL=http://localhost:7000` and `npm run dev`.
- Scrape the Zucchini Pasta and Spicy Chicken Meatballs recipes, open each, swipe to the Nutrition card, expand the ingredient breakdown.

- [ ] **Step 3: Confirm the breakdown quality**

Expected in the breakdown table:
- Ingredients matched to USDA descriptions (e.g. "Zucchini, raw", "Egg, whole, raw", "Basil, fresh") rather than branded/cocktail noise.
- `matched: true` for common ingredients; FatSecret only fills genuine USDA gaps.
- Per-serving and whole-recipe totals are in a believable range for the recipe.

- [ ] **Step 4: Final review**

Use superpowers:requesting-code-review to verify the work meets the spec, then superpowers:finishing-a-development-branch to integrate.

---

## Self-Review Notes

- **Spec coverage:** schema (Task 1), import script incl. import-script-in-plan decision (Tasks 2–3), in-memory Fuse search (Task 4), USDA-first/FatSecret-fallback (Task 5), startup wiring + DB-down fallback (Task 6), testing strategy (every task + Task 7). SR Legacy + Foundation filter is in Task 3 (`WANTED_TYPES`). All spec sections map to a task.
- **Type consistency:** `buildFoodRow` (Tasks 2–3) emits `{ fdcId, description, dataType, category, calories, protein, fat, carbs }` matching the `Food` model (Task 1) and what `prisma.food.createMany` expects. `formatDescription`/`makeUsdaSearch` (Task 4) and `makeFoodResolver` (Task 5) return `{ food_name, food_description }`, the exact contract `combine.js` + `parseFoodDescription` already consume. `loadFoods`/`buildIndex`/`makeUsdaSearch`/`makeFoodResolver` names are used identically in Task 6.
- **Placeholder scan:** every code step contains full code; no TBD/TODO; manual DB-dependent steps (import, smoke tests) are explicit because they require the user's MSSQL instance.
- **csv-parser / fuse.js** are already dependencies — no extra installs beyond Prisma.
