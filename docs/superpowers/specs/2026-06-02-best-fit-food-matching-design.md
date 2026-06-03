# Best-Fit Food Matching — Design Spec

**Date:** 2026-06-02
**Branch:** feat/ingredient-overrides
**Status:** Approved design, pending implementation plan

## Problem

When resolving a recipe ingredient to a USDA food, the backend returns the
**first** match it finds per lookup tier rather than evaluating all candidates
and choosing the closest. For simple ingredients this produces confidently wrong
matches.

Worked example — ingredient `"Onion"`:

- The local DB stores the plain food as `"Onions, raw"` (plural primary segment).
- `makeUsdaSearch` Tier 1 (exact primary match) compares `"onions"` to `"onion"`
  → miss (plural).
- Tier 2 (prefix) checks `startsWith("onion ")` / `startsWith("onion,")`
  → miss (`"onions,"`).
- Tier 3 (multi-word set match) is skipped — `"onion"` is a single word.
- Tier 4 (Fuse fuzzy fallback) returns the **first** calorie-bearing hit, which
  can be a processed form such as `"Onion rings, breaded, par fried, frozen,
  unprepared"`.

Expected: the backend should rank the candidate set
`[Onion rings…, Yellow Onion, Onion, Onion knots, Onion stir fry]` and pick the
plain `Onion`/`Onions, raw` as the best fit.

## Goals

- Replace "first match wins" with "score all candidates, pick the best fit" in
  both food resolvers.
- Fix the literal single-word plural case (`Onion` → `Onions, raw`).
- Prefer plain/whole foods over processed forms when the ingredient is simple.
- Keep the `makeUsdaSearchMany` picker list ordered best-fit-first.
- Preserve all existing behavior covered by `usdaClient.test.js`.

## Non-Goals

- No change to FatSecret fallback (`fatsecretClient.js`) or the
  `foodResolver.js` provider composition.
- No change to `combine.js` / `cleanForSearch` ingredient pre-processing.
- No new runtime dependencies (continue using `fuse.js`).
- No database/schema changes.

## Design Decisions (confirmed)

1. **Scope:** apply scoring to both `makeUsdaSearch` (single result, used during
   nutrition calculation) and `makeUsdaSearchMany` (the replace-ingredient
   picker).
2. **Mechanism:** a deterministic heuristic scoring function — not Fuse-score
   tuning. Fuse is used only to build a candidate shortlist and as a tiebreaker.
3. **No-match behavior:** if no candidate clears a minimum score threshold,
   `makeUsdaSearch` returns `null` (ingredient becomes "estimated"/unmatched),
   exactly as today. `makeUsdaSearchMany` filters out sub-threshold candidates.

## Architecture

### New unit: `backend/nutrition/scoreFood.js`

A pure, dependency-free module. Public surface:

- `singularize(word)` — lightweight plural normalizer: `ies → y`, `ses/xes/zes/
  ches/shes → strip es`, trailing `s → strip` (with a short guard list for words
  that should not be stripped, e.g. `molasses`). Used for segment and word
  comparison only; never mutates stored data.
- `scoreCandidate(query, food)` → `number`. `query` is the cleaned, lowercased
  ingredient string; `food` is a DB row (`{ description, calories, … }`).
  Higher is better. Returns a score on a stable scale so candidates are directly
  comparable. A score below `MIN_SCORE` means "not a real match".

Scoring components (weights tuned during implementation to satisfy the test
matrix below; relative ordering is the contract, exact numbers are not):

| Signal | Direction | Purpose |
|---|---|---|
| Exact primary-segment match after `singularize` | large + | `onion` ↔ `Onions, raw` |
| All query words appear as whole words in primary segment | + | `chicken breast` ↔ `Chicken, … breast …` first-seg word |
| All query words appear anywhere in description | small + | word-order inversion `olive oil` ↔ `Oil, olive …` |
| Count of extra descriptor words / comma-segments in description | penalty | prefer `Onions, raw` over `Onion rings, breaded, par fried, frozen, unprepared` |
| Processed-form words present but absent from query (`rings, breaded, fried, par, frozen, dehydrated, powder, powdered, juice, canned, dried, paste, flakes, chips, sauce`) | penalty | demote processed forms for simple queries |
| Fuse fuzzy score | tiebreaker | stable ordering among near-equal candidates |

Exported constant `MIN_SCORE` defines the match threshold.

### Candidate pool (shared helper inside `usdaClient.js`)

To avoid scoring the entire `foods` array on every call, build a bounded
shortlist:

```
pool = unique(
  Fuse.search(query).slice(0, POOL_LIMIT)   // ≈ 25 fuzzy candidates
  ∪ exactPrimaryMatches(query)              // singularized exact primary segment
  ∪ prefixPrimaryMatches(query)             // primary starts with query
)
```

This guarantees the high-confidence exact/prefix candidates are always present
even when Fuse ranks them poorly, while keeping per-call scoring O(POOL_LIMIT).

### Integration

**`makeUsdaSearch(index, foods)`** — replace the four sequential tiers with:

1. Short-circuit guards unchanged (`name` length < 2 → `null`).
2. Build candidate pool.
3. Apply the existing calorie filter: drop `calories == null || calories <= 0`
   unless the query is a zero-cal food (`isZeroCalFood` regex unchanged).
4. Score remaining candidates with `scoreCandidate`.
5. Return `toResult(best)` if `bestScore >= MIN_SCORE`, else `null`.

**`makeUsdaSearchMany(index, foods, limit)`** — same pool + calorie filter +
scoring, then:

1. Drop candidates below `MIN_SCORE`.
2. Sort by score descending (Fuse score breaks ties).
3. `slice(0, limit)`, map to result shape (`{ food_name, food_description,
   fdcId }`).

The `isZeroCalFood` and `hasCalories` helpers and the per-100g
`formatDescription` output are unchanged. The provider contract returned to
`combine.js` (`{ food_name, food_description }`) is unchanged.

## Data Flow (unchanged externally)

```
recipe ingredient line
  → combine.js parseIngredient + cleanForSearch
  → searchFood(query)            [foodResolver: USDA then FatSecret]
  → makeUsdaSearch  ── NEW: pool → score → best-fit ──> { food_name, food_description } | null
  → parseFoodDescription → scale by grams → nutrition totals
```

Only the internal selection logic of the USDA resolvers changes. Upstream
(`combine.js`) and downstream (`parseFoodDescription.js`) are untouched.

## Error Handling

- Empty / too-short query: return `null` (single) / `[]` (many), as today.
- Empty `foods` array or no candidates: `null` / `[]`.
- `scoreCandidate` operates only on already-loaded in-memory rows; it performs no
  I/O and cannot throw on normal input. Defensive `String(... )` coercion guards
  malformed descriptions.

## Testing

### Hard constraint — existing cases stay green (`usdaClient.test.js`)

1. `zucchini` → `Zucchini, raw`
2. `salt` → `Salt, table` (not `Butter, salted`)
3. `butter` → `Butter, with salt` (shorter primary preferred over
   `Butter replacement…`)
4. `olive oil` → `Oil, olive, salad or cooking` (word inversion)
5. `chicken breast` → `Chicken, broilers, breast, raw` (skips 0-cal lunchmeat)
6. `zzzzzzzz` → `null`; empty / single-char → `null`
7. `makeUsdaSearchMany` returns ≤ N candidates in `{ food_name,
   food_description, fdcId }` shape; `[]` for short queries

### New unit tests — `backend/nutrition/__tests__/scoreFood.test.js`

- `singularize`: `onions→onion`, `berries→berry`, `dishes→dish`,
  `molasses→molasses` (guarded), `oil→oil` (no-op).
- `scoreCandidate` ranks plain `Onions, raw` above `Onion rings, breaded, par
  fried, frozen, unprepared`, `Onion knots`, `Onion stir fry` for query
  `onion`.
- Sub-threshold (`bestScore < MIN_SCORE`) for an unrelated candidate.

### New integration cases — `usdaClient.test.js`

- `makeUsdaSearch('onion', …)` over the spec's candidate set returns the plain
  onion food.
- `makeUsdaSearchMany('onion', …)` returns the candidate list with the plain
  onion ranked first.

## Risks & Mitigations

- **Weight tuning regresses an existing case.** Mitigation: the existing 8-case
  suite is the gate; run it on every weight change. Treat relative ordering, not
  absolute numbers, as the contract.
- **POOL_LIMIT too small drops the correct food.** Mitigation: exact/prefix
  matches are force-included in the pool regardless of Fuse rank.
- **Plural normalizer over-stems.** Mitigation: keep `singularize` conservative
  with a short guard list; it only affects comparison, never stored values.
