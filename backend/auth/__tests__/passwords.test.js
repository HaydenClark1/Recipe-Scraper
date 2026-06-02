const test = require('node:test')
const assert = require('node:assert')
const { hashPassword, verifyPassword } = require('../passwords')

test('hashPassword produces a hash different from the plaintext', async () => {
  const hash = await hashPassword('hunter2')
  assert.notStrictEqual(hash, 'hunter2')
  assert.ok(hash.length > 20)
})

test('verifyPassword returns true for the correct password', async () => {
  const hash = await hashPassword('hunter2')
  assert.strictEqual(await verifyPassword('hunter2', hash), true)
})

test('verifyPassword returns false for a wrong password', async () => {
  const hash = await hashPassword('hunter2')
  assert.strictEqual(await verifyPassword('wrong', hash), false)
})
