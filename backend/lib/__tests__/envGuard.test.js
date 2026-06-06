const test = require('node:test')
const assert = require('node:assert')
const { checkProductionSecrets } = require('../envGuard')

const WEAK = 'change_me_to_a_long_random_string'
const STRONG = 'a9f3c2e1b7d84f60a1c2e3d4f5061728394a5b6c7d8e9f0011223344556677889'

test('throws in production when JWT_SECRET is missing', () => {
  assert.throws(() => checkProductionSecrets({ NODE_ENV: 'production' }), /JWT_SECRET/)
})

test('throws in production when JWT_SECRET is the known default', () => {
  assert.throws(() => checkProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: WEAK }), /JWT_SECRET/)
})

test('throws in production when JWT_SECRET is too short', () => {
  assert.throws(() => checkProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: 'short' }), /JWT_SECRET/)
})

test('passes in production with a strong secret', () => {
  assert.doesNotThrow(() => checkProductionSecrets({ NODE_ENV: 'production', JWT_SECRET: STRONG }))
})

test('does not throw outside production even with a weak secret', () => {
  assert.doesNotThrow(() => checkProductionSecrets({ NODE_ENV: 'development', JWT_SECRET: WEAK }))
  assert.doesNotThrow(() => checkProductionSecrets({ JWT_SECRET: WEAK }))
})
