const dns = require('dns').promises
const net = require('net')

function err(message) {
  const e = new Error(message)
  e.code = 'UNSAFE_URL'
  return e
}

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true
  const [a, b] = parts
  if (a === 0) return true                       // 0.0.0.0/8 "this network"
  if (a === 10) return true                       // private
  if (a === 127) return true                      // loopback
  if (a === 169 && b === 254) return true         // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true         // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true                        // multicast (224/4) + reserved (240/4)
  return false
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip)
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase()
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIPv4(mapped[1])
    if (lower === '::1' || lower === '::') return true   // loopback / unspecified
    if (/^fe[89ab]/.test(lower)) return true              // fe80::/10 link-local
    if (/^f[cd]/.test(lower)) return true                 // fc00::/7 unique-local
    if (lower.startsWith('ff')) return true               // multicast
    return false
  }
  return true // unknown format → block
}

// Validate a user-supplied URL before fetching it, to prevent SSRF. Requires
// http(s), and rejects hosts that resolve to internal/reserved addresses.
// `lookup` is injectable for testing (defaults to DNS).
async function assertSafeUrl(url, { lookup = dns.lookup } = {}) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw err('invalid URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw err(`unsupported URL scheme: ${parsed.protocol}`)
  }

  const host = parsed.hostname
  let ips
  if (net.isIP(host)) {
    ips = [host]
  } else {
    const results = await lookup(host, { all: true })
    ips = (results || []).map((r) => r.address)
  }

  if (!ips.length) throw err('could not resolve host')
  for (const ip of ips) {
    if (isPrivateIp(ip)) throw err('blocked internal/private address')
  }
  return parsed.href
}

module.exports = { assertSafeUrl, isPrivateIp }
