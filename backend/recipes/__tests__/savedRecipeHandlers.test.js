const test = require('node:test')
const assert = require('node:assert')
const {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler,
} = require('../savedRecipeHandlers')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('serializeRecipe JSON-encodes arrays and attaches userId', () => {
  const row = serializeRecipe({ title: 'Soup', ingredients: ['a', 'b'], instructions: ['x'] }, 9)
  assert.strictEqual(row.userId, 9)
  assert.strictEqual(row.title, 'Soup')
  assert.strictEqual(row.ingredients, JSON.stringify(['a', 'b']))
  assert.strictEqual(row.instructions, JSON.stringify(['x']))
})

test('deserializeRecipe parses arrays back', () => {
  const r = deserializeRecipe({
    id: 3, title: 'Soup', image: null,
    ingredients: JSON.stringify(['a']), instructions: JSON.stringify(['x']),
    servings: '4', sourceUrl: null, createdAt: 'now',
  })
  assert.deepStrictEqual(r.ingredients, ['a'])
  assert.deepStrictEqual(r.instructions, ['x'])
  assert.strictEqual(r.id, 3)
})

test('list returns the current user\'s recipes (deserialized)', async () => {
  const prisma = { savedRecipe: { findMany: async ({ where }) => {
    assert.strictEqual(where.userId, 9)
    return [{ id: 1, title: 'A', image: null, ingredients: '["i"]', instructions: '["s"]', servings: null, sourceUrl: null, createdAt: 't' }]
  } } }
  const res = mockRes()
  await makeListHandler(prisma)({ userId: 9 }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.deepStrictEqual(res.body.recipes[0].ingredients, ['i'])
})

test('create stores a serialized recipe for the user', async () => {
  let createdData = null
  const prisma = { savedRecipe: { create: async ({ data }) => { createdData = data; return { id: 2, ...data, createdAt: 't' } } } }
  const res = mockRes()
  await makeCreateHandler(prisma)({ userId: 9, body: { recipe: { title: 'B', ingredients: ['i'], instructions: ['s'] } } }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(createdData.userId, 9)
  assert.deepStrictEqual(res.body.recipe.ingredients, ['i'])
})

test('create 400 when recipe missing', async () => {
  const res = mockRes()
  await makeCreateHandler({})({ userId: 9, body: {} }, res)
  assert.strictEqual(res.statusCode, 400)
})

test('delete removes only the user\'s recipe', async () => {
  const prisma = { savedRecipe: { deleteMany: async ({ where }) => {
    assert.strictEqual(where.id, 5)
    assert.strictEqual(where.userId, 9)
    return { count: 1 }
  } } }
  const res = mockRes()
  await makeDeleteHandler(prisma)({ userId: 9, params: { id: '5' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.body, { deleted: true })
})

test('delete 404 when nothing was deleted (not owned)', async () => {
  const prisma = { savedRecipe: { deleteMany: async () => ({ count: 0 }) } }
  const res = mockRes()
  await makeDeleteHandler(prisma)({ userId: 9, params: { id: '5' } }, res)
  assert.strictEqual(res.statusCode, 404)
})

test('serializeRecipe stores ingredientsData and derives the flat ingredients column', () => {
  const data = serializeRecipe({
    title: 'T',
    ingredientsData: [
      { id: 'a', text: '2 eggs', nutrition: { manual: { calories: 140 } } },
      { id: 'b', text: 'salt', nutrition: { excluded: true } },
    ],
    instructions: ['mix', 'cook'],
  }, 7)
  assert.deepStrictEqual(JSON.parse(data.ingredients), ['2 eggs', 'salt'])
  assert.deepStrictEqual(JSON.parse(data.instructions), ['mix', 'cook'])
  const rich = JSON.parse(data.ingredientsData)
  assert.strictEqual(rich[0].text, '2 eggs')
  assert.deepStrictEqual(rich[0].nutrition, { manual: { calories: 140 } })
  assert.strictEqual(data.userId, 7)
})

test('serializeRecipe accepts plain string ingredients (wraps them)', () => {
  const data = serializeRecipe({ title: 'T', ingredients: ['a', 'b'], instructions: [] }, 1)
  const rich = JSON.parse(data.ingredientsData)
  assert.strictEqual(rich.length, 2)
  assert.strictEqual(rich[0].text, 'a')
  assert.strictEqual(rich[0].nutrition, null)
  assert.ok(typeof rich[0].id === 'string' && rich[0].id.length > 0)
})

test('deserializeRecipe parses ingredientsData into rich + flat ingredients', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["2 eggs","salt"]',
    instructions: '["mix"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    ingredientsData: '[{"id":"a","text":"2 eggs","nutrition":{"manual":{"calories":140}}},{"id":"b","text":"salt","nutrition":{"excluded":true}}]',
  })
  assert.deepStrictEqual(r.ingredients, ['2 eggs', 'salt'])
  assert.strictEqual(r.ingredientsData[0].id, 'a')
  assert.deepStrictEqual(r.ingredientsData[1].nutrition, { excluded: true })
  assert.deepStrictEqual(r.instructions, ['mix'])
})

test('deserializeRecipe falls back to plain ingredients when ingredientsData is null (legacy)', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["2 eggs","salt"]',
    instructions: '["mix"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    ingredientsData: null,
  })
  assert.deepStrictEqual(r.ingredients, ['2 eggs', 'salt'])
  assert.strictEqual(r.ingredientsData.length, 2)
  assert.strictEqual(r.ingredientsData[0].text, '2 eggs')
  assert.strictEqual(r.ingredientsData[0].nutrition, null)
})

test('update replaces editable fields, scoped to the owner', async () => {
  let updateArg = null
  const prisma = {
    savedRecipe: {
      findFirst: async ({ where }) => (where.id === 5 && where.userId === 9 ? { id: 5 } : null),
      update: async (arg) => { updateArg = arg; return { id: 5, ...arg.data, ingredients: arg.data.ingredients, instructions: arg.data.instructions } },
    },
  }
  const res = mockRes()
  const req = { userId: 9, params: { id: '5' }, body: { recipe: { title: 'New', ingredientsData: [{ id: 'a', text: 'x', nutrition: null }], instructions: ['s1'] } } }
  await makeUpdateHandler(prisma)(req, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(updateArg.where.id, 5)
  assert.deepStrictEqual(JSON.parse(updateArg.data.ingredients), ['x'])
  assert.strictEqual(JSON.parse(updateArg.data.ingredientsData)[0].text, 'x')
})

test('update 404 when recipe not owned', async () => {
  const prisma = { savedRecipe: { findFirst: async () => null } }
  const res = mockRes()
  await makeUpdateHandler(prisma)({ userId: 9, params: { id: '5' }, body: { recipe: { title: 'X' } } }, res)
  assert.strictEqual(res.statusCode, 404)
})

const sampleRows = [
  { id: 1, title: 'Chicken Soup', image: null, ingredients: '["2 chicken breasts","salt"]', instructions: '["cook"]', servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]', sourceUrl: null, createdAt: 't' },
  { id: 2, title: 'Veggie Stir Fry', image: null, ingredients: '["broccoli","soy sauce"]', instructions: '["fry"]', servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]', sourceUrl: null, createdAt: 't' },
]

function searchPrisma(rows) {
  return { savedRecipe: { findMany: async ({ where }) => {
    assert.strictEqual(where.userId, 9)
    return rows
  } } }
}

test('search matches on title', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: { q: 'chicken' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.strictEqual(res.body.recipes[0].id, 1)
})

test('search matches on ingredients', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: { q: 'broccoli' } }, res)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.strictEqual(res.body.recipes[0].id, 2)
})

test('empty query returns all of the user\'s recipes', async () => {
  const res = mockRes()
  await makeSearchHandler(searchPrisma(sampleRows))({ userId: 9, query: {} }, res)
  assert.strictEqual(res.body.recipes.length, 2)
})

// ── Nutrition persistence ──────────────────────────────────────────────────

const stubNutrition = { totals: { calories: 300 }, items: [], estimated: false }
const makeComputeNutrition = (result = stubNutrition) => async () => result

test('create stores nutrition and nutritionSig when computeNutrition is provided', async () => {
  let createdData = null
  const prisma = { savedRecipe: { create: async ({ data }) => { createdData = data; return { id: 1, ...data, createdAt: 't' } } } }
  const res = mockRes()
  const computeNutrition = makeComputeNutrition()
  await makeCreateHandler(prisma, { computeNutrition })({
    userId: 9, body: { recipe: { title: 'Soup', ingredients: ['a'], instructions: ['x'], servings: '2' } },
  }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.ok(createdData.nutrition, 'nutrition should be stored')
  assert.ok(createdData.nutritionSig, 'nutritionSig should be stored')
  assert.deepStrictEqual(JSON.parse(createdData.nutrition).totals, { calories: 300 })
})

test('create saves with nutrition=null when computeNutrition throws (best-effort)', async () => {
  let createdData = null
  const prisma = { savedRecipe: { create: async ({ data }) => { createdData = data; return { id: 1, ...data, createdAt: 't' } } } }
  const res = mockRes()
  const computeNutrition = async () => { throw new Error('FatSecret unavailable') }
  await makeCreateHandler(prisma, { computeNutrition })({
    userId: 9, body: { recipe: { title: 'Soup', ingredients: ['a'], instructions: ['x'] } },
  }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(createdData.nutrition, null)
})

test('update skips recompute when signature unchanged', async () => {
  let computeCalls = 0
  const computeNutrition = async () => { computeCalls++; return stubNutrition }

  // Compute sig for this recipe first (same way handler will)
  const { nutritionSignature } = require('../../nutrition/signature')
  const recipe = { title: 'T', ingredients: ['a'], instructions: ['x'], servings: null }
  const sig = nutritionSignature({ ingredients: ['a'], overrides: [], servings: null })

  const prisma = {
    savedRecipe: {
      findFirst: async () => ({ id: 5, nutritionSig: sig, nutrition: JSON.stringify(stubNutrition) }),
      update: async (arg) => ({ id: 5, ...arg.data, createdAt: 't' }),
    },
  }
  const res = mockRes()
  await makeUpdateHandler(prisma, { computeNutrition })({
    userId: 9, params: { id: '5' }, body: { recipe },
  }, res)
  assert.strictEqual(computeCalls, 0, 'should not recompute when sig unchanged')
})

test('update recomputes nutrition when signature changes', async () => {
  let computeCalls = 0
  const computeNutrition = async () => { computeCalls++; return stubNutrition }

  const prisma = {
    savedRecipe: {
      findFirst: async () => ({ id: 5, nutritionSig: 'old-sig', nutrition: null }),
      update: async (arg) => ({ id: 5, ...arg.data, createdAt: 't' }),
    },
  }
  const res = mockRes()
  await makeUpdateHandler(prisma, { computeNutrition })({
    userId: 9, params: { id: '5' }, body: { recipe: { title: 'T', ingredients: ['a'], instructions: ['x'] } },
  }, res)
  assert.strictEqual(computeCalls, 1, 'should recompute when sig changed')
})

test('update tolerates throwing computeNutrition and still saves', async () => {
  const computeNutrition = async () => { throw new Error('offline') }
  let updateData = null
  const prisma = {
    savedRecipe: {
      findFirst: async () => ({ id: 5, nutritionSig: 'old', nutrition: null }),
      update: async (arg) => { updateData = arg.data; return { id: 5, ...arg.data, createdAt: 't' } },
    },
  }
  const res = mockRes()
  await makeUpdateHandler(prisma, { computeNutrition })({
    userId: 9, params: { id: '5' }, body: { recipe: { title: 'T', ingredients: ['a'], instructions: ['x'] } },
  }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(updateData.nutrition, null)
})

test('deserializeRecipe returns parsed nutrition object', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["a"]', instructions: '["x"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    nutrition: JSON.stringify(stubNutrition),
    nutritionSig: 'abc123',
  })
  assert.deepStrictEqual(r.nutrition.totals, { calories: 300 })
  assert.strictEqual(r.nutritionSig, 'abc123')
})

test('deserializeRecipe returns nutrition=null when not stored', () => {
  const r = deserializeRecipe({
    id: 1, title: 'T', image: null,
    ingredients: '["a"]', instructions: '["x"]',
    servings: null, prepTime: null, totalTime: null, category: '[]', cuisine: '[]',
    sourceUrl: null, createdAt: 't',
    nutrition: null, nutritionSig: null,
  })
  assert.strictEqual(r.nutrition, null)
})
