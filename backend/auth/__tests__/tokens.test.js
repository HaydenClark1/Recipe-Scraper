const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret'
const { signToken, verifyToken } = require('../tokens')

test('signToken then verifyToken round-trips the payload', () => {
  const token = signToken({ userId: 7, email: 'a@b.com' })
  const payload = verifyToken(token)
  assert.strictEqual(payload.userId, 7)
  assert.strictEqual(payload.email, 'a@b.com')
})

test('verifyToken throws on a tampered token', () => {
  const token = signToken({ userId: 1 })
  assert.throws(() => verifyToken(token + 'x'))
})

test('verifyToken throws on a token signed with a different secret', () => {
  const jwt = require('jsonwebtoken')
  const foreign = jwt.sign({ userId: 1 }, 'other-secret')
  assert.throws(() => verifyToken(foreign))
})
