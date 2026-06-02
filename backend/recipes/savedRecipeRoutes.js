const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeReplaceOverridesHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  router.put('/:id/overrides', makeReplaceOverridesHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
