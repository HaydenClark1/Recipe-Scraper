const test = require('node:test')
const assert = require('node:assert')
const { singularize, scoreCandidate, MIN_SCORE } = require('../scoreFood')

// --- singularize ---

test('singularize: strips trailing s for common words', () => {
  assert.strictEqual(singularize('onions'), 'onion')
  assert.strictEqual(singularize('carrots'), 'carrot')
  assert.strictEqual(singularize('tomatoes'), 'tomato')
})

test('singularize: handles ies→y', () => {
  assert.strictEqual(singularize('berries'), 'berry')
  assert.strictEqual(singularize('cherries'), 'cherry')
})

test('singularize: handles ses/xes/zes/ches/shes', () => {
  assert.strictEqual(singularize('dishes'), 'dish')
  assert.strictEqual(singularize('boxes'), 'box')
})

test('singularize: no-op for guarded words', () => {
  assert.strictEqual(singularize('molasses'), 'molasses')
  assert.strictEqual(singularize('hummus'), 'hummus')
})

test('singularize: no-op when already singular', () => {
  assert.strictEqual(singularize('oil'), 'oil')
  assert.strictEqual(singularize('chicken'), 'chicken')
  assert.strictEqual(singularize('salt'), 'salt')
})

// --- scoreCandidate: the Onion problem ---

test('scoreCandidate ranks plain onion above onion rings', () => {
  const plainOnion = { description: 'Onions, raw', calories: 40, fat: 0.1, carbs: 9.3, protein: 1.1 }
  const onionRings = { description: 'Onion rings, breaded, par fried, frozen, unprepared', calories: 276, fat: 13, carbs: 36, protein: 4 }
  const plainScore = scoreCandidate('onion', plainOnion)
  const ringsScore = scoreCandidate('onion', onionRings)
  assert.ok(plainScore > ringsScore, `plain onion (${plainScore}) should score higher than onion rings (${ringsScore})`)
})

test('scoreCandidate ranks plain onion above onion knots', () => {
  const plainOnion = { description: 'Onions, raw', calories: 40, fat: 0.1, carbs: 9.3, protein: 1.1 }
  const onionKnots = { description: 'Onion knots', calories: 300, fat: 10, carbs: 45, protein: 6 }
  const plainScore = scoreCandidate('onion', plainOnion)
  const knotsScore = scoreCandidate('onion', onionKnots)
  assert.ok(plainScore > knotsScore, `plain onion (${plainScore}) should score higher than onion knots (${knotsScore})`)
})

test('scoreCandidate ranks plain onion above onion stir fry', () => {
  const plainOnion = { description: 'Onions, raw', calories: 40, fat: 0.1, carbs: 9.3, protein: 1.1 }
  const stirFry = { description: 'Onion stir fry', calories: 85, fat: 4, carbs: 11, protein: 2 }
  const plainScore = scoreCandidate('onion', plainOnion)
  const stirScore = scoreCandidate('onion', stirFry)
  assert.ok(plainScore > stirScore, `plain onion (${plainScore}) should score higher than onion stir fry (${stirScore})`)
})

// --- scoreCandidate: existing tier behaviors preserved via scoring ---

test('scoreCandidate ranks zucchini raw above unrelated food', () => {
  const zucchini = { description: 'Zucchini, raw', calories: 16, fat: 0.18, carbs: 3.35, protein: 1.21 }
  const flour = { description: 'Wheat flour, white, all-purpose', calories: 364, fat: 0.98, carbs: 76.31, protein: 10.33 }
  assert.ok(scoreCandidate('zucchini', zucchini) > scoreCandidate('zucchini', flour))
})

test('scoreCandidate: exact-primary match (with plural) scores at or above MIN_SCORE', () => {
  const plainOnion = { description: 'Onions, raw', calories: 40, fat: 0.1, carbs: 9.3, protein: 1.1 }
  assert.ok(scoreCandidate('onion', plainOnion) >= MIN_SCORE)
})

test('scoreCandidate: processed-form penalty pushes score below plain match', () => {
  const plain = { description: 'Garlic', calories: 149, fat: 0.5, carbs: 33, protein: 6.4 }
  const processed = { description: 'Garlic powder', calories: 331, fat: 0.7, carbs: 73, protein: 16.5 }
  assert.ok(scoreCandidate('garlic', plain) > scoreCandidate('garlic', processed))
})

test('MIN_SCORE is a positive number', () => {
  assert.ok(typeof MIN_SCORE === 'number' && MIN_SCORE > 0)
})
