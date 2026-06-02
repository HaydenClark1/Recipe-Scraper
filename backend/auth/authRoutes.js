const express = require('express')
const { makeSignupHandler, makeLoginHandler } = require('./authHandlers')

function createAuthRouter(prisma) {
  const router = express.Router()
  router.post('/signup', makeSignupHandler(prisma))
  router.post('/login', makeLoginHandler(prisma))
  return router
}

module.exports = { createAuthRouter }
