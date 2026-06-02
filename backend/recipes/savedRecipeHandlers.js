function toOverrideRow(o) {
  return {
    ingredientIndex: o.index,
    type: o.type,
    foodName: o.foodName ?? null,
    foodDescription: o.foodDescription ?? null,
    fdcId: o.fdcId ?? null,
    quantity: o.quantity ?? null,
    unit: o.unit ?? null,
  }
}

function fromOverrideRow(r) {
  const o = { index: r.ingredientIndex, type: r.type }
  if (r.type === 'replace') {
    o.foodName = r.foodName
    o.foodDescription = r.foodDescription
    if (r.fdcId != null) o.fdcId = r.fdcId
  } else if (r.type === 'amount') {
    o.quantity = r.quantity
    o.unit = r.unit
  }
  return o
}

function serializeRecipe(recipe, userId) {
  return {
    userId,
    title: recipe.title || '',
    image: recipe.image ?? null,
    ingredients: JSON.stringify(recipe.ingredients || []),
    instructions: JSON.stringify(recipe.instructions || []),
    servings: recipe.servings ?? null,
    prepTime: recipe.prepTime ?? null,
    totalTime: recipe.totalTime ?? null,
    category: JSON.stringify(recipe.category || []),
    cuisine: JSON.stringify(recipe.cuisine || []),
    sourceUrl: recipe.sourceUrl ?? null,
  }
}

function deserializeRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients: JSON.parse(row.ingredients || '[]'),
    instructions: JSON.parse(row.instructions || '[]'),
    servings: row.servings,
    prepTime: row.prepTime,
    totalTime: row.totalTime,
    category: JSON.parse(row.category || '[]'),
    cuisine: JSON.parse(row.cuisine || '[]'),
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
    overrides: (row.overrides || []).map(fromOverrideRow),
  }
}

function makeListHandler(prisma) {
  return async function list(req, res) {
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId }, include: { overrides: true } })
    return res.status(200).json({ recipes: rows.map(deserializeRecipe) })
  }
}

function makeCreateHandler(prisma) {
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : []
    const data = serializeRecipe(recipe, req.userId)
    if (overrides.length) data.overrides = { create: overrides.map(toOverrideRow) }
    const row = await prisma.savedRecipe.create({ data, include: { overrides: true } })
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

function makeReplaceOverridesHandler(prisma) {
  return async function replace(req, res) {
    const id = Number(req.params.id)
    const overrides = Array.isArray(req.body.overrides) ? req.body.overrides : []
    const owned = await prisma.savedRecipe.findFirst({ where: { id, userId: req.userId }, include: { overrides: true } })
    if (!owned) return res.status(404).json({ error: 'Recipe not found' })
    const ops = [prisma.ingredientOverride.deleteMany({ where: { savedRecipeId: id } })]
    if (overrides.length) {
      ops.push(prisma.ingredientOverride.createMany({ data: overrides.map((o) => ({ ...toOverrideRow(o), savedRecipeId: id })) }))
    }
    await prisma.$transaction(ops)
    const updatedRow = { ...owned, overrides: overrides.map(toOverrideRow) }
    return res.status(200).json({ recipe: deserializeRecipe(updatedRow) })
  }
}

module.exports = {
  serializeRecipe, deserializeRecipe,
  toOverrideRow, fromOverrideRow,
  makeListHandler, makeCreateHandler, makeDeleteHandler,
  makeReplaceOverridesHandler,
}
