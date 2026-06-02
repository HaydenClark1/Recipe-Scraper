const test = require('node:test')
const assert = require('node:assert')
const { makeAuthMiddleware } = require('../authMiddleware')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('sets req.userId and calls next when token is valid', () => {
  const mw = makeAuthMiddleware(() => ({ userId: 42, email: 'a@b.com' }))
  const req = { headers: { authorization: 'Bearer good.token' } }
  const res = mockRes()
  let nextCalled = false
  mw(req, res, () => { nextCalled = true })
  assert.strictEqual(req.userId, 42)
  assert.strictEqual(req.userEmail, 'a@b.com')
  assert.strictEqual(nextCalled, true)
})

test('401 when Authorization header is missing', () => {
  const mw = makeAuthMiddleware(() => ({ userId: 1 }))
  const res = mockRes()
  let nextCalled = false
  mw({ headers: {} }, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})

test('401 when verifyToken throws (invalid/expired)', () => {
  const mw = makeAuthMiddleware(() => { throw new Error('expired') })
  const res = mockRes()
  let nextCalled = false
  mw({ headers: { authorization: 'Bearer bad' } }, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})
