const crypto = require('crypto')
const Fuse = require('fuse.js')

function newId() {
  return crypto.randomUUID()
}

function normalizeIngredientItems(input) {
  const arr = Array.isArray(input) ? input : []
  return arr.map((el) =>
    typeof el === 'string'
      ? { id: newId(), text: el, nutrition: null }
      : { id: el.id || newId(), text: el.text || '', nutrition: el.nutrition ?? null }
  )
}

function serializeRecipe(recipe, userId) {
  const rich = normalizeIngredientItems(recipe.ingredientsData ?? recipe.ingredients)
  return {
    userId,
    title: recipe.title || '',
    image: recipe.image ?? null,
    ingredients: JSON.stringify(rich.map((r) => r.text)),
    instructions: JSON.stringify(recipe.instructions || []),
    servings: recipe.servings ?? null,
    prepTime: recipe.prepTime ?? null,
    totalTime: recipe.totalTime ?? null,
    category: JSON.stringify(recipe.category || []),
    cuisine: JSON.stringify(recipe.cuisine || []),
    sourceUrl: recipe.sourceUrl ?? null,
    ingredientsData: JSON.stringify(rich),
  }
}

function deserializeRecipe(row) {
  let rich
  if (row.ingredientsData) {
    rich = JSON.parse(row.ingredientsData)
  } else {
    rich = JSON.parse(row.ingredients || '[]').map((text) => ({ id: newId(), text, nutrition: null }))
  }
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients: rich.map((r) => r.text),
    ingredientsData: rich,
    instructions: JSON.parse(row.instructions || '[]'),
    servings: row.servings,
    prepTime: row.prepTime,
    totalTime: row.totalTime,
    category: JSON.parse(row.category || '[]'),
    cuisine: JSON.parse(row.cuisine || '[]'),
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
  }
}

function makeListHandler(prisma) {
  return async function list(req, res) {
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    return res.status(200).json({ recipes: rows.map(deserializeRecipe) })
  }
}

function makeCreateHandler(prisma) {
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const row = await prisma.savedRecipe.create({ data: serializeRecipe(recipe, req.userId) })
    return res.status(201).json({ recipe: deserializeRecipe(row) })
  }
}

function makeDeleteHandler(prisma) {
  return async function remove(req, res) {
    const id = Number(req.params.id)
    const { count } = await prisma.savedRecipe.deleteMany({ where: { id, userId: req.userId } })
    if (count === 0) return res.status(404).json({ error: 'Recipe not found' })
    return res.status(200).json({ deleted: true })
  }
}

function makeUpdateHandler(prisma) {
  return async function update(req, res) {
    const id = Number(req.params.id)
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const owned = await prisma.savedRecipe.findFirst({ where: { id, userId: req.userId } })
    if (!owned) return res.status(404).json({ error: 'Recipe not found' })
    const data = serializeRecipe(recipe, req.userId)
    delete data.userId
    const row = await prisma.savedRecipe.update({ where: { id }, data })
    return res.status(200).json({ recipe: deserializeRecipe(row) })
  }
}

function makeSearchHandler(prisma) {
  return async function search(req, res) {
    const q = (req.query && req.query.q ? String(req.query.q) : '').trim()
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    const recipes = rows.map(deserializeRecipe)
    if (!q) return res.status(200).json({ recipes })
    const fuse = new Fuse(recipes, {
      keys: ['title', 'ingredients'],
      threshold: 0.4,
      ignoreLocation: true,
    })
    return res.status(200).json({ recipes: fuse.search(q).map((r) => r.item) })
  }
}

module.exports = {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler,
}
