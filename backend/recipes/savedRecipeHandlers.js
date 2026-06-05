const crypto = require('crypto')
const Fuse = require('fuse.js')
const { nutritionSignature } = require('../nutrition/signature')
const { detectCorrections } = require('./corrections')

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

function serializeRecipe(recipe, userId, { captureOriginal = false } = {}) {
  const rich = normalizeIngredientItems(recipe.ingredientsData ?? recipe.ingredients)
  const row = {
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
  if (captureOriginal) {
    row.originalIngredients = JSON.stringify(rich.map((r) => r.text))
  }
  return row
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
    nutrition: row.nutrition ? JSON.parse(row.nutrition) : null,
    nutritionSig: row.nutritionSig ?? null,
    originalIngredients: row.originalIngredients ? JSON.parse(row.originalIngredients) : null,
  }
}

// Upsert UrlCorrection rows for each changed ingredient line.
async function recordCorrections(prisma, userId, sourceUrl, originalTexts, richItems) {
  if (!sourceUrl || !originalTexts) return
  const corrections = detectCorrections(originalTexts, richItems)
  for (const c of corrections) {
    await prisma.urlCorrection.upsert({
      where: { sourceUrl_ingredientIndex_userId: { sourceUrl, ingredientIndex: c.ingredientIndex, userId } },
      update: { correctionType: c.correctionType, correctionData: c.correctionData, originalText: c.originalText },
      create: { sourceUrl, ingredientIndex: c.ingredientIndex, originalText: c.originalText, correctionType: c.correctionType, correctionData: c.correctionData, userId },
    })
  }
}

// Derive the overrides array from rich ingredientsData (mirrors deriveOverrides in frontend).
function deriveOverrides(rich) {
  const overrides = []
  ;(rich || []).forEach((item, index) => {
    const n = item.nutrition
    if (!n) return
    if (n.excluded) { overrides.push({ index, type: 'exclude' }); return }
    if (n.manual) { overrides.push({ index, type: 'manual', ...n.manual }); return }
    if (n.food) overrides.push({ index, type: 'replace', foodName: n.food.foodName, foodDescription: n.food.foodDescription, fdcId: n.food.fdcId })
    if (n.amount) overrides.push({ index, type: 'amount', quantity: n.amount.quantity, unit: n.amount.unit })
  })
  return overrides
}

// Compute + attach nutrition fields to a serialized row. Best-effort: on failure
// sets nutrition=null so the save is never blocked by an external API outage.
async function attachNutrition(data, recipe, prevSig, computeNutrition) {
  const rich = JSON.parse(data.ingredientsData || '[]')
  const ingredientTexts = rich.map((r) => r.text)
  const overrides = deriveOverrides(rich)
  const sig = nutritionSignature({ ingredients: ingredientTexts, overrides, servings: recipe.servings ?? null })

  if (sig === prevSig) return  // unchanged — keep whatever is stored

  let nutrition = null
  try {
    nutrition = await computeNutrition(ingredientTexts, recipe.servings, overrides)
  } catch {
    // best-effort — fall through with null
  }
  data.nutrition = nutrition ? JSON.stringify(nutrition) : null
  data.nutritionSig = sig
}

function makeListHandler(prisma) {
  return async function list(req, res) {
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    return res.status(200).json({ recipes: rows.map(deserializeRecipe) })
  }
}

function makeCreateHandler(prisma, { computeNutrition } = {}) {
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const data = serializeRecipe(recipe, req.userId, { captureOriginal: true })
    if (computeNutrition) await attachNutrition(data, recipe, null, computeNutrition)
    const row = await prisma.savedRecipe.create({ data })
    const rich = JSON.parse(data.ingredientsData)
    const originalTexts = JSON.parse(data.originalIngredients)
    await recordCorrections(prisma, req.userId, recipe.sourceUrl, originalTexts, rich)
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

function makeUpdateHandler(prisma, { computeNutrition } = {}) {
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
    if (computeNutrition) await attachNutrition(data, recipe, owned.nutritionSig, computeNutrition)
    const row = await prisma.savedRecipe.update({ where: { id }, data })
    // Use the original baseline from when the recipe was first saved
    const originalTexts = owned.originalIngredients ? JSON.parse(owned.originalIngredients) : null
    const rich = JSON.parse(data.ingredientsData)
    await recordCorrections(prisma, req.userId, owned.sourceUrl, originalTexts, rich)
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
  serializeRecipe, deserializeRecipe, deriveOverrides,
  makeListHandler, makeCreateHandler, makeDeleteHandler, makeUpdateHandler, makeSearchHandler,
}
