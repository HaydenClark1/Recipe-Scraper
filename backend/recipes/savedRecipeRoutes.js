const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
