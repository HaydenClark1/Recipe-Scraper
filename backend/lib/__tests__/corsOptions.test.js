const test = require('node:test')
const assert = require('node:assert')
const { isOriginAllowed } = require('../corsOptions')

test('allows requests with no Origin (native apps, curl, same-origin)', () => {
  assert.strictEqual(isOriginAllowed(undefined, ['https://app.com']), true)
  assert.strictEqual(isOriginAllowed('', ['https://app.com']), true)
})

test('allows everything when the allowlist is empty (dev convenience)', () => {
  assert.strictEqual(isOriginAllowed('https://anything.com', []), true)
})

test('allows listed origins and blocks others when allowlist is set', () => {
  const allowed = ['https://app.com', 'capacitor://localhost']
  assert.strictEqual(isOriginAllowed('https://app.com', allowed), true)
  assert.strictEqual(isOriginAllowed('capacitor://localhost', allowed), true)
  assert.strictEqual(isOriginAllowed('https://evil.com', allowed), false)
})
