function serializeRecipe(recipe, userId) {
  return {
    userId,
    title: recipe.title || '',
    image: recipe.image ?? null,
    ingredients: JSON.stringify(recipe.ingredients || []),
    instructions: JSON.stringify(recipe.instructions || []),
    servings: recipe.servings ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
  }
}

function deserializeRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients: JSON.parse(row.ingredients),
    instructions: JSON.parse(row.instructions),
    servings: row.servings,
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

module.exports = {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler,
}
