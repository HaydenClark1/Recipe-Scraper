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

test('normalizeInstructions splits correctly when step numbers exceed 9', () => {
  const raw = [{ '@type': 'HowToStep', text: '1. Mix.2. Bake.10. Serve.' }]
  assert.deepStrictEqual(N.normalizeInstructions(raw), [
    'Mix.',
    'Bake.',
    'Serve.',
  ])
})

test('humanizeDuration returns null for PT0M', () => {
  assert.strictEqual(N.humanizeDuration('PT0M'), null)
})
