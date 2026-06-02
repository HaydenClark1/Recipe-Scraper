const test = require('node:test')
const assert = require('node:assert')
const {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler,
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
