# Nutrition Card — Design Spec

**Date:** 2026-05-31
**Status:** Approved (design)
**Source idea:** `instructions.md`

## Goal

Show the user a combined nutrition label for a recipe: the macros for every
ingredient, fetched from FatSecret, scaled by each ingredient's amount, summed
into a recipe total, and rendered as a clean FDA-style nutrition label on the
existing Nutrition card.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Scaling | **Quantity-aware.** Parse each amount, convert to grams where possible (weights exact; volumes ≈ 1 g/ml; counts fall back), scale FatSecret's per-basis macros. Label is marked an estimate. |
| Nutrients | **Big 4** — Calories, Fat, Carbs, Protein — parsed from the search result's `food_description`. One API call per ingredient. |
| Presentation | **Both** whole-recipe totals and per-serving, when `servings` is known. Per-serving omitted when unknown. |
| FatSecret auth | **OAuth 1.0 (2-legged, HMAC-SHA1).** Chosen over OAuth 2.0 because OAuth 2.0 `client_credentials` requires IP allow-listing, and the backend (Render) has no stable outbound IP. OAuth 1.0 signs each request, so the server IP can change freely. |

## Architecture

Backend-centric. The backend owns FatSecret calls, parsing, gram conversion,
scaling, and combining; the frontend renders. Credentials stay server-side and
the math is unit-testable with `node --test`.

```
NutritionCard
  └─ getNutrition(ingredients, servings)        [frontend/src/api/recipes.js]
       └─ POST /get-nutrition                    [backend/server.js]
            └─ combineNutrition(ingredients, servings, { searchFood })
                 ├─ parseIngredient(line)        → { quantity, unit, name }
                 ├─ toGrams(quantity, unit)       → grams | null
                 ├─ searchFood(name)              → FatSecret match | null   (OAuth 1.0 signed)
                 ├─ parseFoodDescription(desc)    → { basis, calories, fat, carbs, protein }
                 └─ scale + sum                   → { totals, perServing, servings, items, estimated }
```

**Alternatives rejected:**
- *Parse on the frontend* (reuse `parseIngredientLine`): splits logic across the
  wire and still needs numeric/gram conversion the FE parser doesn't do.
- *Call FatSecret from the browser*: leaks credentials, CORS problems.

## Backend module: `backend/nutrition/`

| File | Responsibility | Key export |
|---|---|---|
| `parseIngredient.js` | Split a raw line into quantity/unit/name. Evaluate fractions (`1/2`→0.5), mixed (`1 1/2`→1.5), ranges (`2-3`→2.5), strip parentheticals and post-comma prep notes. | `parseIngredient(line)` → `{ quantity:number\|null, unit:string\|null, name:string }` |
| `units.js` | Convert an amount to grams. Weights exact (g, kg, oz, lb); volumes approximate at ~1 g/ml (tsp, tbsp, cup, ml, l, pint, quart, gallon, fl oz); counts/ambiguous (clove, can, slice, stick, pinch, dash, package, handful) → `null`. | `toGrams(quantity, unit)` → `number\|null` |
| `parseFoodDescription.js` | Parse `"Per 100g - Calories: 52kcal \| Fat: 0.17g \| Carbs: 13.81g \| Protein: 0.26g"`. Recognise the basis: `Per Ng` → grams; `Per 1 <unit>` → unit; else generic serving. | `parseFoodDescription(desc)` → `{ basis, calories, fat, carbs, protein }` |
| `fatsecretClient.js` | OAuth 1.0-signed `foods.search` against `https://platform.fatsecret.com/rest/server.api`. Reads `FATSECRET_CONSUMER_KEY`/`FATSECRET_CONSUMER_SECRET`. Returns the first/best food match, normalising single-object vs array responses. | `searchFood(name)` → `{ food_name, food_description, brand_name }\|null` |
| `combine.js` | Orchestrate the per-ingredient pipeline, apply scaling, sum totals, compute per-serving. `searchFood` is injected so tests run without network. | `combineNutrition(ingredients, servings, { searchFood })` → contract below |

`server.js`: rewire `POST /get-nutrition` to accept `{ ingredients, servings }`,
call `combineNutrition`, and return the contract object (still HTTP 500 on
failure). Remove the old `fatSecretApi` + `Bearer`/`api-keys.json` code.

### OAuth 1.0 signing (fatsecretClient.js)

2-legged OAuth 1.0 — no request/access token, signing key is
`consumer_secret&`. Use the `oauth-1.0a` package with `crypto`:

```js
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')

const oauth = OAuth({
  consumer: { key: process.env.FATSECRET_CONSUMER_KEY, secret: process.env.FATSECRET_CONSUMER_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function: (base, key) => crypto.createHmac('sha1', key).update(base).digest('base64'),
})

const url = 'https://platform.fatsecret.com/rest/server.api'
const data = { method: 'foods.search', search_expression: name, format: 'json' }
const params = oauth.authorize({ url, method: 'GET', data }) // merges oauth_* with data
// GET url?<querystring of { ...data, ...oauth params }>
```

Send all params (method params + `oauth_*`) as the GET query string.

## Scaling rules (combine.js)

For each ingredient:

1. `parseIngredient` → quantity, unit, name.
2. `searchFood(name)`; if no match → `matched:false`, contributes 0, flagged.
3. `parseFoodDescription(food_description)` → basis + per-basis macros.
4. Determine a **scale factor**:
   - `toGrams(quantity, unit)` gives grams **and** basis is `Per Ng` → `scale = grams / N`.
   - basis is `Per 1 <unit>` and ingredient unit matches that unit → `scale = quantity`.
   - quantity present but no usable gram/unit basis → `scale = quantity` against one serving, **flag approximate**.
   - nothing usable → `scale = 1` (one serving), **flag approximate**.
5. `itemMacros = perBasisMacros * scale`.

Totals = Σ item macros. `perServing = totals / servings` when `servings` parses to
a positive number, else `null`. `estimated` is `true` whenever any ingredient was
approximated or unmatched (in practice almost always true — the label always
reads as an estimate).

## Data contract (backend → frontend)

```json
{
  "servings": 4,
  "totals":     { "calories": 1840, "fat": 92.5, "carbs": 130.2, "protein": 110.7 },
  "perServing": { "calories": 460,  "fat": 23.1, "carbs": 32.6,  "protein": 27.7 },
  "items": [
    { "name": "chicken breasts",   "matched": true,  "grams": 900,  "calories": 1485, "fat": 32, "carbs": 0,  "protein": 279 },
    { "name": "Italian seasoning", "matched": false, "grams": null, "calories": 0,    "fat": 0,  "carbs": 0,  "protein": 0 }
  ],
  "estimated": true
}
```

- `perServing` is `null` when servings is unknown.
- `items` lets the card show an "X of Y ingredients matched" footnote.
- All macro numbers are rounded by the frontend (calories → integer, grams → 1 dp).

## Frontend

- `api/recipes.js`: `getNutrition(ingredients, servings)` → `apiClient('/get-nutrition', { ingredients, servings })`.
- `components/cards/NutritionCard.jsx`: pass `recipe.servings`; render an FDA-style
  label — large **Calories**, bold rules, macro rows (Fat / Carbs / Protein in g),
  per-serving primary with whole-recipe secondary when servings is known, and an
  "Estimated · X/Y ingredients matched" footnote. Keep the loading / error / empty
  states already present.
- `components/cards/NutritionCard.css`: label styling using existing card classes
  (`card-heading`, `card-empty`).

## Error & edge handling

| Case | Behaviour |
|---|---|
| Missing credentials / FatSecret error | endpoint returns 500 → card shows "Nutrition data unavailable." |
| Ingredient unmatched | contributes 0, `matched:false`, counted in footnote |
| Volume/count with no gram basis | fall back to one serving × quantity, flagged approximate |
| `servings` null | `perServing:null`; card shows whole-recipe only |
| Empty ingredients | card shows "No nutrition data found." (existing) |

## Out of scope (YAGNI)

Micronutrients beyond the big 4 (sodium, fiber, sugar, cholesterol, saturated
fat), a %DV column, user-adjustable servings/quantities, FatSecret response
caching, and ingredient→food disambiguation UI.

## Testing

- **Backend** (`node --test`): `parseIngredient`, `units.toGrams`,
  `parseFoodDescription`, the scaling branches, and `combineNutrition` with an
  injected fake `searchFood` (no network).
- **Frontend** (Vitest): `NutritionCard` renders the label from a mocked
  `getNutrition`; `getNutrition` forwards `servings`.

## Setup prerequisites (one-time, by the user)

1. Create FatSecret **OAuth 1.0** consumer credentials (Consumer Key + Secret) in
   the FatSecret platform dashboard. No IP allow-listing required.
2. Add to `backend/.env`:
   ```
   FATSECRET_CONSUMER_KEY=...
   FATSECRET_CONSUMER_SECRET=...
   ```
3. `npm install oauth-1.0a` in `backend/`.
