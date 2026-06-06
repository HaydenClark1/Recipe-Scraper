// Whether a request Origin is allowed. Requests with no Origin (native mobile
// apps, curl, same-origin) always pass. When the allowlist is empty, all origins
// pass (dev convenience) — set ALLOWED_ORIGINS in production to lock it down.
function isOriginAllowed(origin, allowed) {
  if (!origin) return true
  if (!allowed || allowed.length === 0) return true
  return allowed.includes(origin)
}

function parseAllowed(env = process.env.ALLOWED_ORIGINS) {
  return (env || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function makeCorsOptions(env = process.env.ALLOWED_ORIGINS) {
  const allowed = parseAllowed(env)
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowed)) callback(null, true)
      else callback(new Error('Not allowed by CORS'))
    },
  }
}

module.exports = { isOriginAllowed, parseAllowed, makeCorsOptions }
