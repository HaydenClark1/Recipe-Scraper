const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware, { computeNutrition } = {}) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.get('/search', makeSearchHandler(prisma))
  router.post('/', makeCreateHandler(prisma, { computeNutrition }))
  router.put('/:id', makeUpdateHandler(prisma, { computeNutrition }))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
