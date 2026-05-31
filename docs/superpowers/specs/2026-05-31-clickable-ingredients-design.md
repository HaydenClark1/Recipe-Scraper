# Clickable Ingredients in Instructions — Design

**Date:** 2026-05-31
**Status:** Approved, pending implementation plan

## Goal

Let users tap an ingredient mentioned in an instruction step and see a small popover
with that ingredient's amount, so they don't have to swipe back to the Ingredients card.

Example: Ingredients contains `1/2 tsp Italian seasoning`. The instruction
"Season each breast with Italian seasoning, salt, and black pepper..." should let the
user tap **Italian seasoning** and see a popover reading `1/2 tsp Italian seasoning`.

If the instruction already states an amount next to the word, the word is **not**
clickable. Example: "...add the olive oil and 1 Tbsp of butter." — **butter** is plain
text because the measurement is already given inline.

## Constraints

- **No third-party APIs and no new runtime dependencies.** All parsing is done with
  hand-written heuristics in the frontend.
- This replaces the current Spoonacular-backed highlighting in `InstructionsCard.jsx`.
- Must not regress the existing recipe detail flow (the card renders inside an Embla
  carousel slide).

## Current state (what exists today)

- `InstructionsCard.jsx` already highlights ingredient mentions with `<mark>`, but it
  obtains the ingredient *names* by calling `parseIngredients()` →
  `POST /parse-ingredients-api` → `api.spoonacular.com/recipes/parseIngredients`
  (a third party, keyed by `process.env.spoon`).
- Ingredients arrive as already-cleaned strings (e.g. `"1/2 tsp Italian seasoning"`)
  produced by `normalizeIngredients`/`cleanText` in `backend/scraper/normalize.js`,
  which also normalizes unicode fractions (`½` → `1/2`).
- Frontend test tooling is already configured: **Vitest 4 + @testing-library/react +
  jsdom**. Backend uses `node --test`.

## Architecture

Frontend-only. Three pure logic modules plus two UI pieces. Each module has one clear
purpose, a small interface, and is independently unit-testable.

### Module: `frontend/src/lib/ingredientParser.js`

```
parseIngredientLine(raw: string) -> {
  raw: string,          // original cleaned line, unchanged
  amountText: string|null, // reassembled "quantity + unit", e.g. "1/2 tsp" or "2" or null
  name: string,         // ingredient name without quantity, unit, or prep notes
  display: string,      // popover text: [amountText, name].filter(Boolean).join(' ') || raw
  matchTerms: string[], // lowercased terms to search for in instruction text
}
```

Parsing steps:
1. Remove trailing prep notes for name purposes: a trailing `, <words>` clause
   (`, melted`, `, minced`, `, finely chopped`) and parenthetical groups `(...)`.
2. Parse a **leading quantity**: whole numbers, decimals, fractions (`1/2`), mixed
   numbers (`1 1/2`), and ranges (`2-3`, `2 to 3`). Unicode fractions are already
   normalized upstream but the regex tolerates them anyway.
3. Parse an optional **unit** immediately after the quantity, matched against a known
   `UNITS` set: teaspoon/tsp, tablespoon/tbsp, cup, ounce/oz, pound/lb, gram/g,
   kilogram/kg, milliliter/ml, liter/l, clove, can, pinch, dash, slice, stick, package,
   handful (each with plural/abbreviated variants). Units are matched case-insensitively.
4. `amountText` = quantity (+ unit if present). If there is no leading quantity at all,
   `amountText = null`.
5. `name` = the remaining text after removing quantity, unit, and the prep notes from
   step 1, trimmed. If empty, `name` falls back to the raw line.
6. `display` = `[amountText, name].filter(Boolean).join(' ')`; if that is empty, use `raw`.
   - `"1 Tbsp butter, melted"` → `display = "1 Tbsp butter"`.
   - `"Salt and pepper to taste"` → `amountText = null`, `display = "Salt and pepper to taste"`.
7. `matchTerms`: the full `name` plus its **head noun** (last significant word),
   each generated in **singular and plural** form using simple `-s/-es/-ies` rules.
   This lets ingredient `chicken breasts` match the instruction word `breast`.
   Terms shorter than 3 chars and a small stopword set (`and`, `or`, `to`, `of`, `the`)
   are excluded to avoid noise.

### Module: `frontend/src/lib/inlineAmount.js`

```
hasInlineAmountBefore(tokens: string[], matchStartIndex: number) -> boolean
```

Scans the 1–3 tokens immediately before a matched ingredient word (skipping connector
words `of`, `the`) for a quantity: a number/fraction/range, optionally followed by a
unit. Returns `true` when an amount is present, which suppresses clickability.

- `["add", "1", "Tbsp", "of", "butter"]`, match at `butter` → `true` (suppress).
- `["Season", "with", "Italian", "seasoning"]`, match at `Italian` → `false` (clickable).

### Module: `frontend/src/lib/highlightInstruction.js`

```
buildSegments(stepText: string, parsedIngredients: Parsed[]) -> Array<
  { text: string, ingredient: Parsed|null }
>
```

Pure function. Tokenizes `stepText`, finds matches of any ingredient `matchTerm`
**longest-first** (most specific phrase wins; matched spans never overlap), and for each
match calls `hasInlineAmountBefore`. Produces an ordered list of segments:
- `ingredient: null` → render as plain text.
- `ingredient: <parsed>` → render as a clickable, highlighted span.

Because it is a pure data transform, the two worked examples from this spec become
literal test cases.

### Component: `frontend/src/components/IngredientPopover.jsx` (+ `.css`)

A small bubble anchored to the tapped word's `<button>`. Shows `ingredient.display`.
Dismisses on: tap outside, tap the same word again, scroll, or carousel slide/tab change.
Position is computed from the anchor's bounding rect and clamped/flipped to stay on screen.

### Component: `frontend/src/components/cards/InstructionsCard.jsx` (rewrite)

- Removes the `useState`/`useEffect`/`parseIngredients` network call entirely.
- Parses `recipe.ingredients` synchronously via `parseIngredientLine` (memoized on the
  ingredients array).
- Renders each step through `buildSegments`; clickable segments become
  `<button className="ingredient-link">`, plain segments are text.
- Only clickable words receive the highlight style (words with an inline amount get no
  special styling). Highlight == "tap me for the amount".
- Tracks a single open popover (open one closes any other).

## Data flow

```
recipe.ingredients (string[])
  └─ parseIngredientLine each ──> Parsed[] (memoized)
recipe.instructions (string[])
  └─ for each step: buildSegments(step, Parsed[]) ──> segments
        └─ segment.ingredient != null ──> <button class="ingredient-link">
              └─ onClick ──> open IngredientPopover showing ingredient.display
```

## Carousel interaction

`InstructionsCard` is an Embla slide. Embla fires `click` only on a tap (not on a drag),
so word taps coexist with swipe. The implementation must verify taps work while the card
is the active slide and that the popover closes on slide change.

## Error handling / edge cases

- Ingredient with no parseable quantity (`Salt and pepper to taste`) → `amountText null`,
  popover shows the cleaned name; still clickable (the amount info "to taste" is useful).
- A step that matches no ingredient → renders entirely as plain text (no regression).
- Multiple ingredients matching the same word → longest/most-specific match wins.
- Empty `recipe.ingredients` or `recipe.instructions` → existing empty states preserved.

## Test plan (Vitest)

- `frontend/src/lib/__tests__/ingredientParser.test.js` — ~12 cases covering fractions,
  mixed numbers, ranges, no-unit (`2 chicken breasts`), `Salt and pepper to taste`,
  prep notes (`, melted`), parentheticals, `display` reassembly, and `matchTerms`
  (incl. plural/singular head-noun generation).
- `frontend/src/lib/__tests__/inlineAmount.test.js` — `1 Tbsp of butter` ⇒ true;
  `Season with Italian seasoning` ⇒ false; spacing/unit edge cases.
- `frontend/src/lib/__tests__/highlightInstruction.test.js` — full step → expected
  segment list; both spec examples as literal cases.
- `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx` (RTL) — render the
  card; assert `Italian seasoning` is a button and tapping it shows `1/2 tsp Italian
  seasoning`; assert `butter` in the olive-oil step is **not** a button.

## Scope / cleanup

- **Remove** `POST /parse-ingredients-api` from `backend/server.js`, the
  `parseIngredients()` function in `frontend/src/api/recipes.js`, and the now-unused
  `process.env.spoon` reference. No other Spoonacular usage exists.
- `getNutrition` (FoodData.csv based) is untouched.
- No new runtime dependencies; no backend changes beyond endpoint removal.
