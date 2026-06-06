const test = require('node:test')
const assert = require('node:assert')
const { withCache, withConcurrencyLimit } = require('../fatsecretCache')

test('cache returns the same result within TTL without calling fn again', async () => {
  let calls = 0
  const fn = async (q) => { calls++; return { food_name: q } }
  const cached = withCache(fn, { ttlMs: 60_000 })

  const r1 = await cached('egg')
  const r2 = await cached('egg')
  assert.deepStrictEqual(r1, r2)
  assert.strictEqual(calls, 1)
})

test('cache calls fn again for a different key', async () => {
  let calls = 0
  const fn = async (q) => { calls++; return { food_name: q } }
  const cached = withCache(fn, { ttlMs: 60_000 })

  await cached('egg')
  await cached('flour')
  assert.strictEqual(calls, 2)
})

test('cache expiry causes a re-fetch', async () => {
  let calls = 0
  const fn = async (q) => { calls++; return { food_name: q } }
  const cached = withCache(fn, { ttlMs: 1 }) // 1ms TTL

  await cached('egg')
  await new Promise((r) => setTimeout(r, 5))
  await cached('egg')
  assert.strictEqual(calls, 2)
})

test('withConcurrencyLimit serializes calls over the limit', async () => {
  const order = []
  const fn = async (n) => {
    order.push(`start:${n}`)
    await new Promise((r) => setTimeout(r, 10))
    order.push(`end:${n}`)
    return n
  }
  const limited = withConcurrencyLimit(fn, { maxConcurrent: 1 })
  await Promise.all([limited(1), limited(2)])
  // With maxConcurrent=1, end:1 must come before start:2
  assert.ok(order.indexOf('end:1') < order.indexOf('start:2'),
    `Expected end:1 before start:2, got: ${order.join(', ')}`)
})
