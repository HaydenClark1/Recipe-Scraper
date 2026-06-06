// Known insecure placeholder values that must never be used in production.
const WEAK_SECRETS = new Set([
  'change_me_to_a_long_random_string',
  'dev-insecure-secret',
  'secret',
  'changeme',
])

const MIN_SECRET_LENGTH = 32

// Refuse to start in production with a missing/weak/short JWT_SECRET.
function checkProductionSecrets(env = process.env) {
  if (env.NODE_ENV !== 'production') return
  const secret = env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET must be set in production')
  if (WEAK_SECRETS.has(secret)) throw new Error('JWT_SECRET is a known default — set a strong random value in production')
  if (secret.length < MIN_SECRET_LENGTH) throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`)
}

module.exports = { checkProductionSecrets, WEAK_SECRETS, MIN_SECRET_LENGTH }
