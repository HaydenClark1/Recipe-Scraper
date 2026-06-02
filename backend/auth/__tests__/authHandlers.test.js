const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret'
const { makeSignupHandler, makeLoginHandler } = require('../authHandlers')
const { hashPassword } = require('../passwords')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('signup creates a user and returns a token', async () => {
  const created = []
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => { created.push(data); return { id: 1, email: data.email } },
    },
  }
  const res = mockRes()
  await makeSignupHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.ok(res.body.token)
  assert.deepStrictEqual(res.body.user, { id: 1, email: 'a@b.com' })
  assert.notStrictEqual(created[0].passwordHash, 'pw123456') // stored hashed
})

test('signup 400 when email or password missing', async () => {
  const res = mockRes()
  await makeSignupHandler({})({ body: { email: 'a@b.com' } }, res)
  assert.strictEqual(res.statusCode, 400)
})

test('signup 409 when email already exists', async () => {
  const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com' }) } }
  const res = mockRes()
  await makeSignupHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 409)
})

test('login returns a token for correct credentials', async () => {
  const passwordHash = await hashPassword('pw123456')
  const prisma = { user: { findUnique: async () => ({ id: 5, email: 'a@b.com', passwordHash }) } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.body.token)
  assert.deepStrictEqual(res.body.user, { id: 5, email: 'a@b.com' })
})

test('login 401 for wrong password', async () => {
  const passwordHash = await hashPassword('pw123456')
  const prisma = { user: { findUnique: async () => ({ id: 5, email: 'a@b.com', passwordHash }) } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'a@b.com', password: 'WRONG' } }, res)
  assert.strictEqual(res.statusCode, 401)
})

test('login 401 for unknown email', async () => {
  const prisma = { user: { findUnique: async () => null } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'no@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 401)
})
