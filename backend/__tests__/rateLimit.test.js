const test = require('node:test')
const assert = require('node:assert')
const { makeRateLimiter } = require('../lib/rateLimiter')

// Resolve when either next() is called (allowed) or res.send/json fires (blocked).
function makeReq(ip = '1.2.3.4') { return { ip, headers: {} } }
function callLimiter(limiter, ip = '1.2.3.4') {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this },
      json(b) { resolve(this.statusCode); return this },
      send(b) { resolve(this.statusCode); return this },
      set() { return this },
      setHeader() {},
      getHeader() { return null },
    }
    limiter(makeReq(ip), res, () => resolve(200))
  })
}

test('allows requests under the limit', async () => {
  const limiter = makeRateLimiter({ max: 5, windowMs: 60_000 })
  for (let i = 0; i < 5; i++) {
    const code = await callLimiter(limiter)
    assert.strictEqual(code, 200)
  }
})

test('returns 429 once the cap is exceeded', async () => {
  const limiter = makeRateLimiter({ max: 2, windowMs: 60_000 })
  await callLimiter(limiter)
  await callLimiter(limiter)
  const code = await callLimiter(limiter)
  assert.strictEqual(code, 429)
})

test('different IPs have independent counters', async () => {
  const limiter = makeRateLimiter({ max: 1, windowMs: 60_000 })
  const [code1, code2] = await Promise.all([callLimiter(limiter, '1.1.1.1'), callLimiter(limiter, '2.2.2.2')])
  assert.strictEqual(code1, 200)
  assert.strictEqual(code2, 200)
})
