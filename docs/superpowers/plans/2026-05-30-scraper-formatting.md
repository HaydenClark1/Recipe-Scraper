# Scraper Formatting & Extraction Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move recipe scraping out of `backend/server.js` into a focused, tested `backend/scraper/` module that cleans output (HTML entities, tags, whitespace, fractions, ISO durations, array yields) and flattens every JSON-LD instruction shape, with no change to the JSON the frontend consumes.

**Architecture:** A three-stage pipeline — `fetch` (HTML with a browser User-Agent) → `extract` (JSON-LD → microdata → tightened DOM fallback) → `normalize` (one cleaning layer applied to every field). `index.js` orchestrates and returns the existing response shape. `server.js`'s `/scrape-recipe` route becomes a thin handler.

**Tech Stack:** Node 22 (CommonJS), Express 5, cheerio, axios, `he` (already installed). Tests use the built-in Node test runner (`node --test`, `node:assert`) — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-30-scraper-formatting-design.md`

---

## File Structure

- Create: `backend/scraper/normalize.js` — pure cleaning functions.
- Create: `backend/scraper/extract.js` — strategy chain returning a raw recipe object + image.
- Create: `backend/scraper/fetch.js` — `fetchHtml(url)` axios wrapper with User-Agent.
- Create: `backend/scraper/index.js` — `assembleRecipe(html)` (pure) and `scrapeRecipe(url)` (fetch + assemble).
- Create: `backend/scraper/__tests__/normalize.test.js`
- Create: `backend/scraper/__tests__/extract.test.js`
- Create: `backend/scraper/__tests__/index.test.js`
- Modify: `backend/package.json` — set `test` script to `node --test`.
- Modify: `backend/server.js` — replace `/scrape-recipe` body; delete moved helpers.

Test fixtures are inlined in the test files (small, deterministic, offline) and are taken from the real JSON-LD of the two confirmed URLs.

---

### Task 1: Set up the backend test runner

**Files:**
- Modify: `backend/package.json:5-7`
- Test: `backend/scraper/__tests__/smoke.test.js` (temporary, deleted in Step 5)

- [ ] **Step 1: Write a trivial failing test**

Create `backend/scraper/__tests__/smoke.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')

test('test runner works', () => {
  assert.strictEqual(1 + 1, 2)
})
```

- [ ] **Step 2: Point the test script at the Node test runner**

In `backend/package.json`, change the `scripts` block:

```json
  "scripts": {
    "test": "node --test"
  },
```

- [ ] **Step 3: Run the tests and verify they pass**

Run: `cd backend; npm test`
Expected: 1 test passing (`tests 1`, `pass 1`, `fail 0`).

- [ ] **Step 4: Delete the smoke test**

```bash
rm backend/scraper/__tests__/smoke.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/package.json
git commit -m "chore: enable node --test runner for backend"
```

---

### Task 2: `cleanText` + fraction normalization

**Files:**
- Create: `backend/scraper/normalize.js`
- Test: `backend/scraper/__tests__/normalize.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/scraper/__tests__/normalize.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')
const N = require('../normalize')

test('cleanText decodes HTML entities', () => {
  assert.strictEqual(N.cleanText('a large chef&#39;s knife'), "a large chef's knife")
  assert.strictEqual(N.cleanText('salt &amp; pepper'), 'salt & pepper')
})

test('cleanText strips inline HTML tags', () => {
  assert.strictEqual(N.cleanText('Mix <b>well</b> then <a href="x">bake</a>'), 'Mix well then bake')
})

test('cleanText collapses whitespace and trims', () => {
  assert.strictEqual(N.cleanText('  Preheat   the\n\noven  '), 'Preheat the oven')
})

test('cleanText normalizes unicode fractions to ASCII', () => {
  assert.strictEqual(N.cleanText('½ tsp salt'), '1/2 tsp salt')
  assert.strictEqual(N.cleanText('¾ cup'), '3/4 cup')
})

test('cleanText handles null and undefined', () => {
  assert.strictEqual(N.cleanText(null), '')
  assert.strictEqual(N.cleanText(undefined), '')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `Cannot find module '../normalize'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/scraper/normalize.js`:

```js
const he = require('he')

const FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6',
  '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '⅐': '1/7', '⅑': '1/9', '⅒': '1/10',
}

function normalizeFractions(str) {
  return str.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅐⅑⅒]/g, (m) => FRACTIONS[m] || m)
}

function cleanText(input) {
  if (input == null) return ''
  let s = String(input)
  s = he.decode(s)              // entities first: &#39; -> ', &frac12; -> ½
  s = s.replace(/<[^>]*>/g, ' ') // strip inline HTML tags
  s = normalizeFractions(s)     // ½ -> 1/2
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

module.exports = { cleanText, normalizeFractions }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS — all `cleanText` tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/normalize.js backend/scraper/__tests__/normalize.test.js
git commit -m "feat: add cleanText with entity decode, tag strip, fraction normalize"
```

---

### Task 3: `humanizeDuration`

**Files:**
- Modify: `backend/scraper/normalize.js`
- Test: `backend/scraper/__tests__/normalize.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/normalize.test.js`:

```js
test('humanizeDuration converts ISO 8601 durations', () => {
  assert.strictEqual(N.humanizeDuration('PT40M'), '40 min')
  assert.strictEqual(N.humanizeDuration('PT10M'), '10 min')
  assert.strictEqual(N.humanizeDuration('PT1H30M'), '1 hr 30 min')
  assert.strictEqual(N.humanizeDuration('PT2H'), '2 hr')
})

test('humanizeDuration passes through non-ISO and empty values', () => {
  assert.strictEqual(N.humanizeDuration('30 minutes'), '30 minutes')
  assert.strictEqual(N.humanizeDuration(null), null)
  assert.strictEqual(N.humanizeDuration(undefined), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `N.humanizeDuration is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/normalize.js`, add the function and export it:

```js
function humanizeDuration(iso) {
  if (iso == null) return null
  if (typeof iso !== 'string') iso = String(iso)
  const m = /^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/.exec(iso.trim())
  if (!m) return iso
  const [, d, h, min] = m
  const parts = []
  if (d) parts.push(`${+d} day${+d > 1 ? 's' : ''}`)
  if (h) parts.push(`${+h} hr`)
  if (min) parts.push(`${+min} min`)
  if (!parts.length) return iso
  return parts.join(' ')
}
```

Update the export line:

```js
module.exports = { cleanText, normalizeFractions, humanizeDuration }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/normalize.js backend/scraper/__tests__/normalize.test.js
git commit -m "feat: add humanizeDuration for ISO 8601 times"
```

---

### Task 4: `normalizeYield`

**Files:**
- Modify: `backend/scraper/normalize.js`
- Test: `backend/scraper/__tests__/normalize.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/normalize.test.js`:

```js
test('normalizeYield unwraps arrays', () => {
  assert.strictEqual(N.normalizeYield(['4']), '4')
})

test('normalizeYield strips leading Serves/Makes', () => {
  assert.strictEqual(N.normalizeYield('Serves 6'), '6')
  assert.strictEqual(N.normalizeYield('Makes 12 cookies'), '12 cookies')
})

test('normalizeYield handles plain and empty values', () => {
  assert.strictEqual(N.normalizeYield('4'), '4')
  assert.strictEqual(N.normalizeYield(null), null)
  assert.strictEqual(N.normalizeYield([]), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `N.normalizeYield is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/normalize.js`, add and export:

```js
function normalizeYield(raw) {
  let v = Array.isArray(raw) ? raw[0] : raw
  if (v == null) return null
  v = cleanText(v).replace(/^(serves|makes|yields?)\s+/i, '')
  return v || null
}
```

Update the export line:

```js
module.exports = { cleanText, normalizeFractions, humanizeDuration, normalizeYield }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/normalize.js backend/scraper/__tests__/normalize.test.js
git commit -m "feat: add normalizeYield to unwrap array yields"
```

---

### Task 5: `normalizeIngredients`

**Files:**
- Modify: `backend/scraper/normalize.js`
- Test: `backend/scraper/__tests__/normalize.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/normalize.test.js`:

```js
test('normalizeIngredients cleans each entry and drops empties', () => {
  const raw = ['1/2 tsp salt &amp; pepper', '  ', '<span>2 eggs</span>', '½ cup milk']
  assert.deepStrictEqual(N.normalizeIngredients(raw), [
    '1/2 tsp salt & pepper',
    '2 eggs',
    '1/2 cup milk',
  ])
})

test('normalizeIngredients returns [] for non-arrays', () => {
  assert.deepStrictEqual(N.normalizeIngredients(null), [])
  assert.deepStrictEqual(N.normalizeIngredients('eggs'), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `N.normalizeIngredients is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/normalize.js`, add and export:

```js
function normalizeIngredients(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(cleanText).filter(Boolean)
}
```

Update the export line:

```js
module.exports = {
  cleanText, normalizeFractions, humanizeDuration, normalizeYield,
  normalizeIngredients,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/normalize.js backend/scraper/__tests__/normalize.test.js
git commit -m "feat: add normalizeIngredients"
```

---

### Task 6: `normalizeInstructions` (flatten, split crammed, strip leading numbers)

This is the core fix for the HalfBakedHarvest case (all steps in one `HowToStep.text`, no space before some numbers, leading numbers that double up against the frontend `<ol>`).

**Files:**
- Modify: `backend/scraper/normalize.js`
- Test: `backend/scraper/__tests__/normalize.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/normalize.test.js`:

```js
test('normalizeInstructions flattens a HowToStep array', () => {
  const raw = [
    { '@type': 'HowToStep', text: 'Fillet the chicken.' },
    { '@type': 'HowToStep', text: 'Season &amp; sear.' },
  ]
  assert.deepStrictEqual(N.normalizeInstructions(raw), [
    'Fillet the chicken.',
    'Season & sear.',
  ])
})

test('normalizeInstructions flattens HowToSection groups', () => {
  const raw = [
    { '@type': 'HowToSection', itemListElement: [
      { '@type': 'HowToStep', text: 'Make the sauce.' },
      { '@type': 'HowToStep', text: 'Simmer 5 min.' },
    ] },
  ]
  assert.deepStrictEqual(N.normalizeInstructions(raw), [
    'Make the sauce.',
    'Simmer 5 min.',
  ])
})

test('normalizeInstructions accepts plain string steps', () => {
  assert.deepStrictEqual(N.normalizeInstructions(['Boil water.', 'Add pasta.']), [
    'Boil water.',
    'Add pasta.',
  ])
})

test('normalizeInstructions splits a single crammed step and strips leading numbers', () => {
  const raw = [{
    '@type': 'HowToStep',
    text: '1. Preheat the oven to 450 F. Line a baking sheet with oil.2. On the sheet pan, mix the chicken.3. Meanwhile, make the sauce.4. Remove the vegetables.',
  }]
  assert.deepStrictEqual(N.normalizeInstructions(raw), [
    'Preheat the oven to 450 F. Line a baking sheet with oil.',
    'On the sheet pan, mix the chicken.',
    'Meanwhile, make the sauce.',
    'Remove the vegetables.',
  ])
})

test('normalizeInstructions does not split decimals inside a single step', () => {
  const raw = [{ '@type': 'HowToStep', text: 'Add 1.5 cups of flour and stir.' }]
  assert.deepStrictEqual(N.normalizeInstructions(raw), ['Add 1.5 cups of flour and stir.'])
})

test('normalizeInstructions returns [] for empty/missing input', () => {
  assert.deepStrictEqual(N.normalizeInstructions(null), [])
  assert.deepStrictEqual(N.normalizeInstructions([]), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `N.normalizeInstructions is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/normalize.js`, add these helpers and the exported function:

```js
function flattenSteps(raw) {
  const out = []
  const visit = (node) => {
    if (node == null) return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (typeof node === 'string') { out.push(node); return }
    if (typeof node === 'object') {
      if (node['@type'] === 'HowToSection') { visit(node.itemListElement); return }
      const t = node.text || node.name
      if (t) out.push(String(t))
      else if (node.itemListElement) visit(node.itemListElement)
    }
  }
  visit(raw)
  return out
}

function splitCrammed(steps) {
  if (steps.length !== 1) return steps
  // Split before a number that starts a new step: "<digit>." followed by a
  // space or a capital letter. This handles "oil.2. On" (no space before 2)
  // while leaving decimals like "1.5 cups" intact.
  const parts = steps[0]
    .split(/(?=\d+\.(?:\s|[A-Z]))/g)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 1 ? parts : steps
}

function stripLeadingNumber(s) {
  return s.replace(/^\s*\d+[.)]\s*/, '')
}

function normalizeInstructions(raw) {
  let steps = flattenSteps(raw)
  steps = splitCrammed(steps)
  return steps.map(stripLeadingNumber).map(cleanText).filter(Boolean)
}
```

Update the export line:

```js
module.exports = {
  cleanText, normalizeFractions, humanizeDuration, normalizeYield,
  normalizeIngredients, normalizeInstructions,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS — all 6 instruction tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/normalize.js backend/scraper/__tests__/normalize.test.js
git commit -m "feat: add normalizeInstructions with section flatten and step-number strip"
```

---

### Task 7: `extract.js` — JSON-LD extraction

**Files:**
- Create: `backend/scraper/extract.js`
- Test: `backend/scraper/__tests__/extract.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/scraper/__tests__/extract.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert')
const { findRecipeLike, extractFromJsonLd } = require('../extract')

const cheerio = require('cheerio')

test('findRecipeLike finds a Recipe inside @graph', () => {
  const graph = { '@graph': [
    { '@type': 'WebPage', name: 'page' },
    { '@type': ['Article', 'Recipe'], name: 'My Recipe' },
  ] }
  const r = findRecipeLike(graph)
  assert.strictEqual(r.name, 'My Recipe')
})

test('findRecipeLike returns null when no recipe present', () => {
  assert.strictEqual(findRecipeLike({ '@type': 'WebPage' }), null)
})

test('extractFromJsonLd reads a recipe from a script tag', () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Recipe","name":"Creamy Garlic Chicken Recipe","recipeYield":["4"],"prepTime":"PT10M","totalTime":"PT40M","recipeIngredient":["1/2 tsp salt"],"recipeInstructions":[{"@type":"HowToStep","text":"Cook it."}]}
    </script></head><body></body></html>`
  const $ = cheerio.load(html)
  const r = extractFromJsonLd($)
  assert.strictEqual(r.name, 'Creamy Garlic Chicken Recipe')
  assert.deepStrictEqual(r.recipeYield, ['4'])
})

test('extractFromJsonLd returns null when no ld+json present', () => {
  const $ = cheerio.load('<html><body><p>no recipe</p></body></html>')
  assert.strictEqual(extractFromJsonLd($), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `Cannot find module '../extract'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/scraper/extract.js`:

```js
const cheerio = require('cheerio')

// Recursively find the first object whose @type contains "recipe".
function findRecipeLike(obj) {
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = findRecipeLike(item)
      if (r) return r
    }
  } else if (obj && typeof obj === 'object') {
    const type = obj['@type']
    if (typeof type === 'string' && type.toLowerCase().includes('recipe')) return obj
    if (Array.isArray(type) && type.some((t) => typeof t === 'string' && t.toLowerCase().includes('recipe'))) return obj
    for (const key in obj) {
      const r = findRecipeLike(obj[key])
      if (r) return r
    }
  }
  return null
}

function extractFromJsonLd($) {
  const scripts = $('script[type="application/ld+json"]').toArray()
  for (const el of scripts) {
    try {
      const parsed = JSON.parse($(el).html())
      const found = findRecipeLike(parsed)
      if (found) return found
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return null
}

module.exports = { findRecipeLike, extractFromJsonLd }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/extract.js backend/scraper/__tests__/extract.test.js
git commit -m "feat: add JSON-LD recipe extraction"
```

---

### Task 8: `extract.js` — image extraction

**Files:**
- Modify: `backend/scraper/extract.js`
- Test: `backend/scraper/__tests__/extract.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/extract.test.js`:

```js
const { extractImage } = require('../extract')

test('extractImage reads first URL from an image array of strings', () => {
  const $ = cheerio.load('<html></html>')
  assert.strictEqual(extractImage($, { image: ['https://x/a.jpg', 'https://x/b.jpg'] }), 'https://x/a.jpg')
})

test('extractImage reads url from an ImageObject', () => {
  const $ = cheerio.load('<html></html>')
  assert.strictEqual(extractImage($, { image: { url: 'https://x/c.jpg' } }), 'https://x/c.jpg')
})

test('extractImage reads a plain string image', () => {
  const $ = cheerio.load('<html></html>')
  assert.strictEqual(extractImage($, { image: 'https://x/d.jpg' }), 'https://x/d.jpg')
})

test('extractImage falls back to og:image', () => {
  const $ = cheerio.load('<html><head><meta property="og:image" content="https://x/og.jpg"></head></html>')
  assert.strictEqual(extractImage($, {}), 'https://x/og.jpg')
})

test('extractImage returns null when no image anywhere', () => {
  const $ = cheerio.load('<html></html>')
  assert.strictEqual(extractImage($, {}), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `extractImage is not a function` (undefined import).

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/extract.js`, add the function and export it:

```js
function extractImage($, recipe) {
  const img = recipe && recipe.image
  let url = null
  if (Array.isArray(img)) {
    const first = img[0]
    url = typeof first === 'string' ? first : (first && first.url) || null
  } else if (img && typeof img === 'object') {
    url = img.url || null
  } else if (typeof img === 'string') {
    url = img
  }
  if (!url) url = $('meta[property="og:image"]').attr('content') || null
  return url || null
}
```

Update the export line:

```js
module.exports = { findRecipeLike, extractFromJsonLd, extractImage }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/extract.js backend/scraper/__tests__/extract.test.js
git commit -m "feat: add image extraction with og:image fallback"
```

---

### Task 9: `extract.js` — microdata + DOM fallbacks and `extractRecipe` orchestrator

**Files:**
- Modify: `backend/scraper/extract.js`
- Test: `backend/scraper/__tests__/extract.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/scraper/__tests__/extract.test.js`:

```js
const { extractFromDom, extractFromMicrodata, extractRecipe } = require('../extract')

test('extractFromDom reads WordPress Recipe Maker markup', () => {
  const html = `<html><body>
    <h1>Blog Title</h1>
    <div class="wprm-recipe">
      <span class="wprm-recipe-ingredient">2 eggs</span>
      <span class="wprm-recipe-ingredient">1 cup flour</span>
      <div class="wprm-recipe-instruction-text">Mix everything.</div>
      <div class="wprm-recipe-instruction-text">Bake 20 min.</div>
    </div>
  </body></html>`
  const $ = cheerio.load(html)
  const r = extractFromDom($)
  assert.deepStrictEqual(r.recipeIngredient, ['2 eggs', '1 cup flour'])
  assert.deepStrictEqual(r.recipeInstructions, ['Mix everything.', 'Bake 20 min.'])
})

test('extractFromDom ignores bare nav lists (returns null)', () => {
  const $ = cheerio.load('<html><body><nav><ul><li>Home</li><li>About</li></ul></nav></body></html>')
  assert.strictEqual(extractFromDom($), null)
})

test('extractFromMicrodata reads itemprop fields scoped to a Recipe', () => {
  const html = `<html><body>
    <div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Micro Recipe</h1>
      <li itemprop="recipeIngredient">3 carrots</li>
      <li itemprop="recipeInstructions">Chop and roast.</li>
    </div>
  </body></html>`
  const $ = cheerio.load(html)
  const r = extractFromMicrodata($)
  assert.strictEqual(r.name, 'Micro Recipe')
  assert.deepStrictEqual(r.recipeIngredient, ['3 carrots'])
})

test('extractRecipe prefers JSON-LD and attaches image', () => {
  const html = `<html><head>
    <meta property="og:image" content="https://x/og.jpg">
    <script type="application/ld+json">
    {"@type":"Recipe","name":"JLD Recipe","recipeIngredient":["salt"],"recipeInstructions":[{"@type":"HowToStep","text":"Cook."}]}
    </script></head><body></body></html>`
  const out = extractRecipe(html)
  assert.strictEqual(out.recipe.name, 'JLD Recipe')
  assert.strictEqual(out.image, 'https://x/og.jpg')
})

test('extractRecipe returns null when nothing is extractable', () => {
  assert.strictEqual(extractRecipe('<html><body><p>nope</p></body></html>'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `extractFromDom is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `backend/scraper/extract.js`, add the three functions and export them. Note the DOM selectors are scoped to known recipe-plugin containers, not bare `ol li`/`ul li`:

```js
function extractFromDom($) {
  const ingredients = []
  $('.wprm-recipe-ingredient, .tasty-recipes-ingredients li').each((_, el) => {
    const t = $(el).text().trim()
    if (t) ingredients.push(t)
  })
  const instructions = []
  $('.wprm-recipe-instruction-text, .tasty-recipes-instructions li').each((_, el) => {
    const t = $(el).text().trim()
    if (t) instructions.push(t)
  })
  if (!ingredients.length && !instructions.length) return null
  const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || ''
  return { name, recipeIngredient: ingredients, recipeInstructions: instructions }
}

function extractFromMicrodata($) {
  const scope = $('[itemtype*="Recipe"]').first()
  if (!scope.length) return null
  const textOf = (prop) => scope.find(`[itemprop="${prop}"]`).map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const name = scope.find('[itemprop="name"]').first().text().trim()
  const recipeIngredient = textOf('recipeIngredient')
  const recipeInstructions = textOf('recipeInstructions')
  if (!recipeIngredient.length && !recipeInstructions.length) return null
  return {
    name,
    recipeIngredient,
    recipeInstructions,
    prepTime: scope.find('[itemprop="prepTime"]').first().attr('content') || null,
    totalTime: scope.find('[itemprop="totalTime"]').first().attr('content') || null,
    recipeYield: scope.find('[itemprop="recipeYield"]').first().text().trim() || null,
  }
}

function extractRecipe(html) {
  const $ = cheerio.load(html)
  const recipe = extractFromJsonLd($) || extractFromMicrodata($) || extractFromDom($)
  if (!recipe) return null
  const image = extractImage($, recipe)
  return { recipe, image }
}
```

Update the export line:

```js
module.exports = {
  findRecipeLike, extractFromJsonLd, extractImage,
  extractFromDom, extractFromMicrodata, extractRecipe,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/extract.js backend/scraper/__tests__/extract.test.js
git commit -m "feat: add microdata and scoped DOM fallbacks with extractRecipe orchestrator"
```

---

### Task 10: `index.js` — `assembleRecipe` + `fetch.js` + `scrapeRecipe`

`assembleRecipe(html)` is pure and fully tested against the two real fixtures. `scrapeRecipe(url)` is a thin fetch + assemble wrapper.

**Files:**
- Create: `backend/scraper/fetch.js`
- Create: `backend/scraper/index.js`
- Test: `backend/scraper/__tests__/index.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/scraper/__tests__/index.test.js`. The two HTML strings reproduce the real JSON-LD shapes confirmed from the live URLs (BudgetBytes: clean `HowToStep` array + array yield; HalfBakedHarvest: a single crammed `HowToStep`):

```js
const test = require('node:test')
const assert = require('node:assert')
const { assembleRecipe } = require('../index')

const BUDGET_BYTES = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Recipe","name":"Creamy Garlic Chicken Recipe","image":["https://x/bb.jpg"],"prepTime":"PT10M","cookTime":"PT30M","totalTime":"PT40M","recipeYield":["4"],"recipeCuisine":["American"],"recipeCategory":["Dinner"],"recipeIngredient":["2  boneless, skinless chicken breasts ($6.49)","1/2 tsp Italian seasoning ($0.05)"],"recipeInstructions":[{"@type":"HowToStep","text":"Using a sharp knife, fillet each chicken breast into two cutlets."},{"@type":"HowToStep","text":"Season &amp; sear until golden."}]}
</script></head><body></body></html>`

const HALF_BAKED = `<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org/","@type":"Recipe","name":"30 Minute Honey Garlic Chicken","image":{"url":"https://x/hbh.jpg"},"prepTime":"PT10M","totalTime":"PT30M","recipeYield":["4"],"recipeIngredient":["2 pounds chicken breasts, cubed"],"recipeInstructions":[{"@type":"HowToStep","text":"1. Preheat the oven to 450 F. Line a baking sheet with oil.2. On the sheet pan, mix the chicken.3. Meanwhile, make the sauce.4. Remove the vegetables."}]}
</script></head><body></body></html>`

test('assembleRecipe: BudgetBytes yields clean servings, times, and steps', () => {
  const r = assembleRecipe(BUDGET_BYTES)
  assert.strictEqual(r.title, 'Creamy Garlic Chicken Recipe')
  assert.strictEqual(r.servings, '4')              // unwrapped from ["4"]
  assert.strictEqual(r.prepTime, '10 min')
  assert.strictEqual(r.totalTime, '40 min')
  assert.deepStrictEqual(r.cuisine, ['American'])
  assert.deepStrictEqual(r.category, ['Dinner'])
  assert.strictEqual(r.image, 'https://x/bb.jpg')
  assert.deepStrictEqual(r.instructions, [
    'Using a sharp knife, fillet each chicken breast into two cutlets.',
    'Season & sear until golden.',                 // entity decoded
  ])
})

test('assembleRecipe: HalfBakedHarvest crammed steps split with no leading numbers', () => {
  const r = assembleRecipe(HALF_BAKED)
  assert.strictEqual(r.servings, '4')
  assert.strictEqual(r.totalTime, '30 min')
  assert.strictEqual(r.image, 'https://x/hbh.jpg')
  assert.deepStrictEqual(r.instructions, [
    'Preheat the oven to 450 F. Line a baking sheet with oil.',
    'On the sheet pan, mix the chicken.',
    'Meanwhile, make the sauce.',
    'Remove the vegetables.',
  ])
})

test('assembleRecipe returns null when no recipe found', () => {
  assert.strictEqual(assembleRecipe('<html><body><p>nope</p></body></html>'), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; npm test`
Expected: FAIL — `Cannot find module '../index'`.

- [ ] **Step 3: Write the minimal implementations**

Create `backend/scraper/fetch.js`:

```js
const axios = require('axios')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchHtml(url) {
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 15000,
  })
  return data
}

module.exports = { fetchHtml }
```

Create `backend/scraper/index.js`:

```js
const { extractRecipe } = require('./extract')
const { fetchHtml } = require('./fetch')
const N = require('./normalize')

function toCleanArray(v) {
  if (v == null) return []
  return (Array.isArray(v) ? v : [v]).map(N.cleanText).filter(Boolean)
}

// Pure: HTML in, frontend-shaped recipe out (or null). Fully unit-tested.
function assembleRecipe(html) {
  const extracted = extractRecipe(html)
  if (!extracted) return null
  const r = extracted.recipe
  return {
    title: N.cleanText(r.name) || 'N/A',
    ingredients: N.normalizeIngredients(r.recipeIngredient),
    prepTime: N.humanizeDuration(r.prepTime) || 'N/A',
    totalTime: N.humanizeDuration(r.totalTime) || 'N/A',
    servings: N.normalizeYield(r.recipeYield) || 'N/A',
    category: toCleanArray(r.recipeCategory),
    cuisine: toCleanArray(r.recipeCuisine),
    instructions: N.normalizeInstructions(r.recipeInstructions),
    image: extracted.image || null,
  }
}

// Thin wrapper: fetch then assemble.
async function scrapeRecipe(url) {
  const html = await fetchHtml(url)
  return assembleRecipe(html)
}

module.exports = { assembleRecipe, scrapeRecipe }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; npm test`
Expected: PASS — both fixture tests green, proving the BudgetBytes and HalfBakedHarvest cases.

- [ ] **Step 5: Commit**

```bash
git add backend/scraper/fetch.js backend/scraper/index.js backend/scraper/__tests__/index.test.js
git commit -m "feat: add assembleRecipe pipeline and scrapeRecipe fetch wrapper"
```

---

### Task 11: Wire the module into `server.js` and remove the old helpers

**Files:**
- Modify: `backend/server.js` (add require at top; replace `/scrape-recipe` route at lines 70-144; delete `splitInstructions` 152-166, `findRecipeLike` 171-200, `findIngredients` 202-227, `findInstructions` 229-292)

- [ ] **Step 1: Add the module import**

In `backend/server.js`, just below the existing `require` block (after the `const {Readable} = require("stream");` line near the top), add:

```js
const { scrapeRecipe } = require("./scraper");
```

- [ ] **Step 2: Replace the `/scrape-recipe` route**

Replace the entire `app.post("/scrape-recipe", ...)` handler (the block currently spanning roughly lines 70-144, from `app.post("/scrape-recipe"` through its closing `});`) with this thin handler:

```js
app.post("/scrape-recipe", async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    const recipe = await scrapeRecipe(url);
    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }
    return res.status(200).json(recipe);
  } catch (err) {
    console.error("Scraping failed:", err.message);
    return res.status(500).json({ error: "Failed to scrape recipe" });
  }
});
```

- [ ] **Step 3: Delete the now-unused helper functions**

Delete these four functions from `backend/server.js` — they have moved into the module:
- `splitInstructions` (the `/** Split the instructions ... */` function)
- `findRecipeLike`
- `findIngredients`
- `findInstructions`

Leave `loadCSVFromGitHub`, the other routes, and `fatSecretApi` untouched.

- [ ] **Step 4: Verify nothing else references the deleted helpers**

Run: `cd backend; node -e "require('./server.js')"` then stop it with Ctrl-C after it prints the startup line.
Expected: server boots and prints `Server running at http://localhost:7000` with no `ReferenceError`. (A missing `api-keys.json` only affects `/get-nutrition`, not startup.)

Also confirm no dangling references remain — run a search:

Run: `cd backend; node -e "const s=require('fs').readFileSync('server.js','utf8'); ['findRecipeLike','findIngredients','findInstructions','splitInstructions'].forEach(n=>{ if(s.includes(n)) throw new Error('still references '+n) }); console.log('clean')"`
Expected: prints `clean`.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend; npm test`
Expected: PASS — all normalize/extract/index tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/server.js
git commit -m "refactor: wire scraper module into /scrape-recipe and remove inline helpers"
```

---

### Task 12: Manual end-to-end verification against the live URLs

**Files:** none (verification only)

- [ ] **Step 1: Start the backend**

Run: `cd backend; node server.js`
Expected: `Server running at http://localhost:7000`.

- [ ] **Step 2: Scrape BudgetBytes**

In a second terminal, run:

```bash
curl -s -X POST http://localhost:7000/scrape-recipe -H "Content-Type: application/json" -d "{\"url\":\"https://www.budgetbytes.com/creamy-garlic-chicken/\"}"
```

Expected: JSON where `servings` is `"4"` (not `["4"]`), `totalTime` is `"40 min"`, and `instructions` is an array of clean step strings with no leading `1.`/`2.` numbers.

- [ ] **Step 3: Scrape HalfBakedHarvest**

```bash
curl -s -X POST http://localhost:7000/scrape-recipe -H "Content-Type: application/json" -d "{\"url\":\"https://www.halfbakedharvest.com/honey-garlic-chicken/\"}"
```

Expected: `instructions` is split into 4+ separate steps, each with no leading number; `totalTime` is `"30 min"`.

- [ ] **Step 4: Confirm in the app (optional)**

Run the frontend (`cd frontend; npm run dev`), scrape both URLs from the Scrape page, and confirm the Instructions card shows clean, individually-numbered steps with no doubled numbering and no `&#39;`-style entities.

- [ ] **Step 5: Stop the backend**

Stop the `node server.js` process (Ctrl-C).

No commit — this task is verification only.

---

## Notes for the implementer

- **Branch:** Work continues on `feat/scraper-formatting` (already created; the design spec is the first commit there).
- **No frontend changes:** `assembleRecipe` returns the exact shape `frontend/src/lib/normalize.js#normalizeScraped` already consumes. The duplicate `splitInstructions` in the frontend now receives pre-split arrays and becomes a harmless no-op; simplifying it is a deliberate follow-up, out of scope here.
- **Entity-decode ordering matters:** in `cleanText`, decode entities *before* stripping tags so entity-encoded markup (`&lt;b&gt;`) is removed too, and *before* fraction normalization so `&frac12;` → `½` → `1/2` works end to end.
