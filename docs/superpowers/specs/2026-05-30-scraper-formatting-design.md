# Recipe Scraper: Extraction Robustness & Output Formatting

**Date:** 2026-05-30
**Status:** Approved design, pending implementation plan

## Problem

The `/scrape-recipe` endpoint in `backend/server.js` extracts recipes from
JSON-LD but produces messy output and misses common site structures. Two
classes of problem, confirmed against real URLs:

**Output is dirty.** HTML entities are never decoded — a step reads
`a large chef&#39;s knife` instead of `a large chef's knife`. Inline HTML
tags, irregular whitespace, raw ISO-8601 durations (`PT40M`), and array-wrapped
yields (`["4"]`) all reach the frontend unprocessed.

**Extraction is fragile.** All steps may arrive crammed into a single
`HowToStep.text`; `HowToSection` groups are not flattened; the DOM fallback
uses selectors so broad (`ol li`, `ul li`) they capture navigation menus.

### Evidence from real URLs

`https://www.budgetbytes.com/creamy-garlic-chicken/`
- `recipeYield: ["4"]` — an **array**, passed through raw to the frontend.
- Times raw: `prepTime PT10M`, `totalTime PT40M`.
- Instructions: clean 7-element `HowToStep` array (works today).

`https://www.halfbakedharvest.com/honey-garlic-chicken/`
- `recipeInstructions` is a **single** `HowToStep` whose `.text` packs every
  step together: `"1. Preheat the oven to 450° F. ...oil.2. On the sheet
  pan...3. Meanwhile...4. Remove..."`.
- Note `oil.2.` — **no space** before the number, so the current split regex
  (`\d+\.\s`, requires trailing whitespace) is unreliable.
- Each step retains its leading `1.` `2.` number. `InstructionsCard` renders an
  `<ol>`, which adds its own numbering → the user sees "**1.** 1. Preheat…"
  (double numbering).

## Goals

- Decode entities, strip inline HTML, and normalize whitespace on every field.
- Flatten all JSON-LD instruction shapes: `HowToStep`, `HowToSection`
  (`itemListElement`), plain strings, and single crammed steps.
- Strip leading step numbers so the frontend `<ol>` is the sole source of
  numbering.
- Humanize times (`PT40M` → "40 min") and yields (`["4"]` → "4").
- Add a real browser User-Agent to the fetch.
- Tighten DOM fallback selectors to recipe-scoped containers.
- No change to the JSON shape the frontend consumes — `normalizeScraped` and
  the cards keep working unchanged.

## Non-Goals

- No scraping-library dependency (Approach C rejected — mature options are
  Python; Node equivalents impose their own output shape).
- No frontend redesign. The duplicate split logic in
  `frontend/src/lib/normalize.js` may be simplified once the backend emits
  clean arrays, but that is a follow-up, not part of this work.
- No changes to the other endpoints (`/search-recipies`, `/save-recipe`,
  `/get-nutrition`, `/parse-ingredients-api`).

## Approach (chosen: A — dedicated extraction pipeline)

Extract all scraping out of `server.js` into a focused `backend/scraper/`
module with single-purpose, independently testable stages. `server.js`'s
`/scrape-recipe` route becomes a thin handler that calls the module.

### Module layout

```
backend/scraper/
  fetch.js       fetch HTML with a browser User-Agent
  extract.js     strategy chain: JSON-LD → microdata → DOM heuristics
  normalize.js   the shared cleaning layer (entities, tags, times, yield, steps)
  index.js       orchestrates fetch → extract → normalize; returns frontend shape
  __tests__/
    fixtures/    saved JSON-LD / HTML captured from real URLs
    *.test.js
```

### `fetch.js`

`fetchHtml(url) -> string`. Uses axios with a desktop browser User-Agent and a
sane timeout. Throws on network/HTTP failure (handled by the route).

### `extract.js`

`extractRecipe(html) -> rawRecipe | null`. Tries strategies in priority order,
returning the first that yields enough fields (at minimum a title plus
ingredients or instructions):

1. **JSON-LD** — parse every `application/ld+json` block; recurse through
   `@graph`, arrays, and nested objects to find `@type` containing "recipe".
2. **Microdata** — `[itemtype*="Recipe"]` with `itemprop` fields, as fallback.
3. **DOM heuristics** — recipe-scoped containers only (e.g. WordPress Recipe
   Maker `.wprm-recipe-*`, Tasty Recipes `.tasty-recipes-*`), not bare
   `ol li` / `ul li`.

`extract.js` returns raw values; it does not clean them.

### `normalize.js`

The single cleaning layer. Pure functions, each independently tested:

- `cleanText(str)` — `he.decode()`, strip inline HTML tags, collapse
  whitespace, trim. Applied to every string field.
- `normalizeIngredients(raw)` — array of cleaned strings; drop empties.
- `normalizeInstructions(raw)` — the core logic:
  - Flatten `HowToStep` (use `.text`, fall back to `.name`).
  - Flatten `HowToSection` by recursing into `itemListElement`.
  - Accept plain-string steps.
  - If the result is a single long string containing multiple `digit.`
    markers, split on a `digit.` boundary that does **not** require trailing
    whitespace (handles `oil.2.`).
  - Strip a leading `^\s*\d+[.)]\s*` step number from each item.
  - `cleanText` each step; drop empties.
- `humanizeDuration(iso)` — `PT40M` → "40 min", `PT1H30M` → "1 hr 30 min";
  pass through non-ISO values unchanged.
- `normalizeYield(raw)` — unwrap arrays (`["4"]` → `"4"`), strip a leading
  "Serves"/"Makes", return a clean string.
- `normalizeFractions(str)` — map unicode fractions (½, ¼, ¾, ⅓…) to ASCII
  (`1/2`) consistently, inside `cleanText`.

### `index.js`

`scrapeRecipe(url)` orchestrates the three stages and returns the **exact**
existing response shape:

```js
{
  title, ingredients, prepTime, totalTime, servings,
  category, cuisine, instructions, image
}
```

Image extraction (JSON-LD `image` in its several shapes, `og:image` fallback)
moves into the module unchanged in behavior.

### `server.js` changes

- Remove `findRecipeLike`, `findIngredients`, `findInstructions`,
  `splitInstructions` (moved into the module).
- `/scrape-recipe` becomes:
  ```js
  app.post("/scrape-recipe", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });
    try {
      const recipe = await scrapeRecipe(url);
      if (!recipe) return res.status(404).json({ error: "Recipe not found" });
      return res.status(200).json(recipe);
    } catch (err) {
      console.error("Scraping failed:", err.message);
      return res.status(500).json({ error: "Failed to scrape recipe" });
    }
  });
  ```

## Error handling

- Network/HTTP error → 500 `{ error: "Failed to scrape recipe" }` (unchanged).
- No recipe extracted by any strategy → 404 `{ error: "Recipe not found" }`.
- Partial data (e.g. ingredients but no instructions) → return what was found;
  the frontend already renders empty sections gracefully.

## Testing

- Capture JSON-LD/HTML from the two confirmed URLs (and 1–2 more once
  available) into `__tests__/fixtures/`.
- Unit tests per stage:
  - `normalize.test.js` — entity decode (`chef&#39;s` → `chef's`), tag strip,
    duration humanize, yield unwrap, fraction map, and the crammed-step
    split + leading-number strip (HalfBakedHarvest case).
  - `extract.test.js` — JSON-LD recursion, microdata fallback, DOM fallback
    scoping.
  - `index.test.js` — full pipeline against each fixture asserts the final
    frontend-shaped object.
- Tests run offline against fixtures (no live network in CI).

## Success criteria

- BudgetBytes: `servings` is `"4"` (not `["4"]`); times read "10 min" /
  "40 min".
- HalfBakedHarvest: instructions are 4+ separate steps with **no** leading
  numbers (no double numbering in the `<ol>`).
- Any field containing `&#39;` / `&amp;` / `&deg;` renders decoded.
- `server.js` no longer contains scraping/parsing helpers; the route is a thin
  handler.
