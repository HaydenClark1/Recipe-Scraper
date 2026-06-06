const test = require('node:test')
const assert = require('node:assert')
const { assertSafeUrl, isPrivateIp } = require('../urlGuard')

// A fake DNS resolver so tests never hit the network.
const resolvesTo = (addr) => async () => [{ address: addr }]

test('isPrivateIp flags loopback, private, link-local, CGNAT', () => {
  for (const ip of ['127.0.0.1', '10.0.0.5', '172.16.4.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0']) {
    assert.strictEqual(isPrivateIp(ip), true, `${ip} should be private`)
  }
})

test('isPrivateIp allows public IPv4', () => {
  for (const ip of ['93.184.216.34', '8.8.8.8', '1.1.1.1']) {
    assert.strictEqual(isPrivateIp(ip), false, `${ip} should be public`)
  }
})

test('isPrivateIp flags IPv6 loopback, ULA, link-local, and mapped v4', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12::3', '::ffff:127.0.0.1']) {
    assert.strictEqual(isPrivateIp(ip), true, `${ip} should be private`)
  }
})

test('assertSafeUrl accepts a public https URL', async () => {
  const href = await assertSafeUrl('https://example.com/recipe', { lookup: resolvesTo('93.184.216.34') })
  assert.ok(href.startsWith('https://example.com'))
})

test('assertSafeUrl rejects non-http(s) schemes', async () => {
  for (const url of ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'data:text/html,x']) {
    await assert.rejects(() => assertSafeUrl(url, { lookup: resolvesTo('93.184.216.34') }), /scheme|protocol/i)
  }
})

test('assertSafeUrl rejects garbage input', async () => {
  await assert.rejects(() => assertSafeUrl('not a url', { lookup: resolvesTo('1.1.1.1') }), /invalid/i)
  await assert.rejects(() => assertSafeUrl('', { lookup: resolvesTo('1.1.1.1') }), /invalid/i)
})

test('assertSafeUrl rejects IP-literal internal targets (cloud metadata, loopback, private)', async () => {
  for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:7000', 'http://10.0.0.5', 'http://192.168.0.1', 'http://[::1]/']) {
    await assert.rejects(() => assertSafeUrl(url), /internal|blocked|private/i)
  }
})

test('assertSafeUrl rejects a public hostname that resolves to a private IP (DNS rebinding)', async () => {
  await assert.rejects(
    () => assertSafeUrl('http://evil.example.com', { lookup: resolvesTo('10.1.2.3') }),
    /internal|blocked|private/i
  )
})

test('assertSafeUrl rejects when host does not resolve', async () => {
  await assert.rejects(
    () => assertSafeUrl('http://nope.example.com', { lookup: async () => [] }),
    /resolve/i
  )
})
