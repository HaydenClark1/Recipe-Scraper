const test = require('node:test')
const assert = require('node:assert')
const { findRecipeLike, extractFromJsonLd, extractImage, extractFromDom, extractFromMicrodata, extractRecipe } = require('../extract')

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

test('extractRecipe falls back to microdata when no JSON-LD present', () => {
  const html = `<html><body>
    <div itemscope itemtype="https://schema.org/Recipe">
      <span itemprop="name">Microdata Recipe</span>
      <li itemprop="recipeIngredient">2 eggs</li>
    </div>
  </body></html>`
  const out = extractRecipe(html)
  assert.ok(out !== null, 'should find a recipe via microdata')
  assert.strictEqual(out.recipe.name, 'Microdata Recipe')
})
