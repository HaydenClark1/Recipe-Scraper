const test = require('node:test')
const assert = require('node:assert')
const { detectCorrections, aggregateCorrections } = require('../corrections')

// ── detectCorrections ──────────────────────────────────────────────────────

test('returns empty array when nothing changed', () => {
  const original = ['2 eggs', '1 cup flour']
  const rich = [
    { text: '2 eggs', nutrition: null },
    { text: '1 cup flour', nutrition: null },
  ]
  assert.deepStrictEqual(detectCorrections(original, rich), [])
})

test('detects a text correction', () => {
  const result = detectCorrections(['2 eggs'], [{ text: '3 eggs', nutrition: null }])
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].correctionType, 'text')
  assert.strictEqual(result[0].ingredientIndex, 0)
  assert.strictEqual(result[0].originalText, '2 eggs')
  assert.deepStrictEqual(JSON.parse(result[0].correctionData), { text: '3 eggs' })
})

test('detects a replace nutrition override', () => {
  const rich = [{ text: '2 eggs', nutrition: { food: { foodName: 'Egg, whole', foodDescription: 'Per 1 large - Calories: 72kcal | Fat: 4.75g | Carbs: 0.36g | Protein: 6.28g', fdcId: 123 } } }]
  const result = detectCorrections(['2 eggs'], rich)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].correctionType, 'replace')
  const data = JSON.parse(result[0].correctionData)
  assert.strictEqual(data.foodName, 'Egg, whole')
})

test('detects an amount override', () => {
  const rich = [{ text: '2 eggs', nutrition: { amount: { quantity: 2, unit: 'each' } } }]
  const result = detectCorrections(['2 eggs'], rich)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].correctionType, 'amount')
  assert.deepStrictEqual(JSON.parse(result[0].correctionData), { quantity: 2, unit: 'each' })
})

test('detects an exclude override', () => {
  const rich = [{ text: '2 eggs', nutrition: { excluded: true } }]
  const result = detectCorrections(['2 eggs'], rich)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].correctionType, 'exclude')
  assert.strictEqual(result[0].correctionData, null)
})

test('detects a manual override', () => {
  const rich = [{ text: '2 eggs', nutrition: { manual: { calories: 140, fat: 10, carbs: 1, protein: 12 } } }]
  const result = detectCorrections(['2 eggs'], rich)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].correctionType, 'manual')
  assert.deepStrictEqual(JSON.parse(result[0].correctionData), { calories: 140, fat: 10, carbs: 1, protein: 12 })
})

test('detects both text and nutrition corrections on the same line', () => {
  const rich = [{ text: '3 eggs', nutrition: { excluded: true } }]
  const result = detectCorrections(['2 eggs'], rich)
  const types = result.map(r => r.correctionType).sort()
  assert.deepStrictEqual(types, ['exclude', 'text'])
})

test('handles mixed changed and unchanged lines', () => {
  const original = ['2 eggs', '1 cup flour', 'salt']
  const rich = [
    { text: '2 eggs', nutrition: null },
    { text: '1 cup flour', nutrition: { excluded: true } },
    { text: 'salt', nutrition: null },
  ]
  const result = detectCorrections(original, rich)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].ingredientIndex, 1)
})

// ── aggregateCorrections ───────────────────────────────────────────────────

function makeRows(overrides) {
  // overrides: array of { ingredientIndex, correctionType, correctionData }
  return overrides.map((o, i) => ({ id: i + 1, sourceUrl: 'http://x.com', ...o }))
}

test('returns empty when no rows', () => {
  assert.deepStrictEqual(aggregateCorrections([], 5), [])
})

test('returns empty when below 60% threshold', () => {
  // 2 corrections out of 5 saves = 40%
  const rows = makeRows([
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 1 },
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 2 },
  ])
  assert.deepStrictEqual(aggregateCorrections(rows, 5), [])
})

test('returns correction when at exactly 60%', () => {
  // 3 out of 5 = 60%
  const rows = makeRows([
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 1 },
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 2 },
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 3 },
  ])
  const result = aggregateCorrections(rows, 5)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].type, 'exclude')
  assert.strictEqual(result[0].index, 0)
})

test('picks the most common specific correction value', () => {
  // 3 users replaced with food A, 2 with food B → food A wins
  const rows = makeRows([
    { ingredientIndex: 1, correctionType: 'replace', correctionData: JSON.stringify({ foodName: 'Egg A' }), userId: 1 },
    { ingredientIndex: 1, correctionType: 'replace', correctionData: JSON.stringify({ foodName: 'Egg A' }), userId: 2 },
    { ingredientIndex: 1, correctionType: 'replace', correctionData: JSON.stringify({ foodName: 'Egg A' }), userId: 3 },
    { ingredientIndex: 1, correctionType: 'replace', correctionData: JSON.stringify({ foodName: 'Egg B' }), userId: 4 },
    { ingredientIndex: 1, correctionType: 'replace', correctionData: JSON.stringify({ foodName: 'Egg B' }), userId: 5 },
  ])
  const result = aggregateCorrections(rows, 5)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].foodName, 'Egg A')
})

test('handles multiple ingredients independently', () => {
  // index 0: 3/5 excluded (above threshold), index 2: 2/5 excluded (below)
  const rows = makeRows([
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 1 },
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 2 },
    { ingredientIndex: 0, correctionType: 'exclude', correctionData: null, userId: 3 },
    { ingredientIndex: 2, correctionType: 'exclude', correctionData: null, userId: 1 },
    { ingredientIndex: 2, correctionType: 'exclude', correctionData: null, userId: 2 },
  ])
  const result = aggregateCorrections(rows, 5)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].index, 0)
})

test('text corrections are returned separately with correctedText', () => {
  const rows = makeRows([
    { ingredientIndex: 0, correctionType: 'text', correctionData: JSON.stringify({ text: '3 eggs' }), userId: 1 },
    { ingredientIndex: 0, correctionType: 'text', correctionData: JSON.stringify({ text: '3 eggs' }), userId: 2 },
    { ingredientIndex: 0, correctionType: 'text', correctionData: JSON.stringify({ text: '3 eggs' }), userId: 3 },
  ])
  const result = aggregateCorrections(rows, 4)
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].type, 'text')
  assert.strictEqual(result[0].correctedText, '3 eggs')
  assert.strictEqual(result[0].index, 0)
})
