const jwt = require('jsonwebtoken')

// Read the secret lazily so tests can set process.env.JWT_SECRET before calling.
function secret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret'
}

function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '7d' })
}

function verifyToken(token) {
  return jwt.verify(token, secret()) // throws on invalid/expired
}

module.exports = { signToken, verifyToken }
