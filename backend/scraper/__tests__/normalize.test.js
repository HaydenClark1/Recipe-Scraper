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
