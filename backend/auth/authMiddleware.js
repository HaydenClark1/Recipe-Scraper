// makeAuthMiddleware(verifyToken) -> Express middleware that requires a valid
// "Authorization: Bearer <token>" header and sets req.userId from the payload.
function makeAuthMiddleware(verifyToken) {
  return function authMiddleware(req, res, next) {
    const header = req.headers && req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    const token = header.slice('Bearer '.length).trim()
    try {
      const payload = verifyToken(token)
      req.userId = payload.userId
      req.userEmail = payload.email
      return next()
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}

module.exports = { makeAuthMiddleware }
