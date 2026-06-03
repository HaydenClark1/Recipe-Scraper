const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.put('/:id', makeUpdateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
