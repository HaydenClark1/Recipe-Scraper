const test = require('node:test')
const assert = require('node:assert')
const { makeFoodResolver } = require('../foodResolver')

const USDA_HIT = { food_name: 'Zucchini, raw', food_description: 'Per 100g - Calories: 16kcal | Fat: 0.18g | Carbs: 3.35g | Protein: 1.21g' }
const FS_HIT = { food_name: 'Zucchini', food_description: 'Per 100g - Calories: 17kcal | Fat: 0.3g | Carbs: 3g | Protein: 1g' }

test('uses USDA when it returns a match (FatSecret not called)', async () => {
  let fsCalled = false
  const resolve = makeFoodResolver({
    usdaSearch: async () => USDA_HIT,
    fatsecretSearch: async () => { fsCalled = true; return FS_HIT },
  })
  assert.deepStrictEqual(await resolve('zucchini'), USDA_HIT)
  assert.strictEqual(fsCalled, false)
})

test('falls back to FatSecret when USDA returns null', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => null,
    fatsecretSearch: async () => FS_HIT,
  })
  assert.deepStrictEqual(await resolve('zucchini'), FS_HIT)
})

test('falls back to FatSecret when USDA throws', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => { throw new Error('index down') },
    fatsecretSearch: async () => FS_HIT,
  })
  assert.deepStrictEqual(await resolve('zucchini'), FS_HIT)
})

test('returns null when both miss', async () => {
  const resolve = makeFoodResolver({
    usdaSearch: async () => null,
    fatsecretSearch: async () => null,
  })
  assert.strictEqual(await resolve('xyz'), null)
})

test('returns null when USDA misses and no FatSecret provided', async () => {
  const resolve = makeFoodResolver({ usdaSearch: async () => null })
  assert.strictEqual(await resolve('xyz'), null)
})

const { makeFoodsResolver } = require('../foodResolver')

test('makeFoodsResolver returns USDA candidates when present', async () => {
  const resolve = makeFoodsResolver({
    usdaSearchMany: async () => [{ food_name: 'A', food_description: 'd' }],
    fatsecretSearchMany: async () => [{ food_name: 'B', food_description: 'd2' }],
  })
  assert.deepStrictEqual((await resolve('x'))[0].food_name, 'A')
})

test('makeFoodsResolver falls back to FatSecret when USDA empty', async () => {
  const resolve = makeFoodsResolver({
    usdaSearchMany: async () => [],
    fatsecretSearchMany: async () => [{ food_name: 'B', food_description: 'd2' }],
  })
  assert.deepStrictEqual((await resolve('x'))[0].food_name, 'B')
})
