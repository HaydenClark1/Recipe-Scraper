const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.get('/search', makeSearchHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.put('/:id', makeUpdateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
