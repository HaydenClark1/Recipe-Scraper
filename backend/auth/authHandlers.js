const { hashPassword, verifyPassword } = require('./passwords')
const { signToken } = require('./tokens')

function makeSignupHandler(prisma) {
  return async function signup(req, res) {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({ data: { email, passwordHash } })
    const token = signToken({ userId: user.id, email: user.email })
    return res.status(201).json({ token, user: { id: user.id, email: user.email } })
  }
}

function makeLoginHandler(prisma) {
  return async function login(req, res) {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }
    const token = signToken({ userId: user.id, email: user.email })
    return res.status(200).json({ token, user: { id: user.id, email: user.email } })
  }
}

module.exports = { makeSignupHandler, makeLoginHandler }
