import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  buildIngredientItems, buildInstructionItems,
  deriveIngredientTexts, deriveInstructionTexts, deriveOverrides, moveById, newId,
} from '../lib/recipeDocument.js'
import { replaceLeadingAmount } from '../lib/amountText.js'

function recipeKey(recipe) {
  return recipe ? (recipe.sourceUrl || recipe.title || '') : ''
}

function applyInitialOverrides(items, overrides) {
  if (!overrides || !overrides.length) return items
  return items.map((item, index) => {
    const ov = overrides.find((o) => o.index === index)
    if (!ov) return item
    let nutrition = {}
    if (ov.type === 'exclude') nutrition = { excluded: true }
    else if (ov.type === 'manual') nutrition = { manual: { calories: ov.calories ?? 0, fat: ov.fat ?? 0, carbs: ov.carbs ?? 0, protein: ov.protein ?? 0 } }
    else if (ov.type === 'replace') nutrition = { food: { foodName: ov.foodName, foodDescription: ov.foodDescription, fdcId: ov.fdcId } }
    else if (ov.type === 'amount') nutrition = { amount: { quantity: ov.quantity, unit: ov.unit } }
    return { ...item, nutrition }
  })
}

export function useRecipeEditor(recipe, { initialOverrides } = {}) {
  const seed = recipe || {}
  const [ingredients, setIngredients] = useState(() =>
    applyInitialOverrides(
      buildIngredientItems(seed.ingredientsData ?? seed.ingredients),
      initialOverrides,
    ))
  const [instructions, setInstructions] = useState(() =>
    buildInstructionItems(seed.instructions))

  // Re-seed when navigating to a different recipe (same mounted page).
  const keyRef = useRef(recipeKey(recipe))
  useEffect(() => {
    const k = recipeKey(recipe)
    if (k !== keyRef.current) {
      keyRef.current = k
      setIngredients(buildIngredientItems(recipe.ingredientsData ?? recipe.ingredients))
      setInstructions(buildInstructionItems(recipe.instructions))
    }
  }, [recipe])

  const patchNutrition = useCallback((id, updater) => {
    setIngredients((prev) => prev.map((it) =>
      it.id === id ? { ...it, nutrition: updater(it.nutrition || {}) } : it))
  }, [])

  // Ingredient text/structure ops
  const editIngredientText = useCallback((id, text) => {
    setIngredients((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)))
  }, [])
  const addIngredient = useCallback(() => {
    setIngredients((prev) => [...prev, { id: newId(), text: '', nutrition: null }])
  }, [])
  const deleteIngredient = useCallback((id) => {
    setIngredients((prev) => prev.filter((it) => it.id !== id))
  }, [])
  const reorderIngredients = useCallback((fromId, toId) => {
    setIngredients((prev) => moveById(prev, fromId, toId))
  }, [])

  // Per-line nutrition ops (each mode is mutually exclusive at the top level)
  const setFood = useCallback((id, food) => {
    patchNutrition(id, (n) => {
      const next = { ...n }
      delete next.excluded
      delete next.manual
      next.food = { foodName: food.food_name, foodDescription: food.food_description }
      if (food.fdcId != null) next.food.fdcId = food.fdcId
      return next
    })
  }, [patchNutrition])
  // Setting an amount also rewrites the ingredient's text line to match, so the
  // displayed line stays consistent with the chosen quantity/unit.
  const setAmount = useCallback((id, quantity, unit) => {
    setIngredients((prev) => prev.map((it) => {
      if (it.id !== id) return it
      const next = { ...(it.nutrition || {}) }
      delete next.excluded
      delete next.manual
      next.amount = { quantity, unit }
      return { ...it, text: replaceLeadingAmount(it.text, quantity, unit), nutrition: next }
    }))
  }, [])
  const setManual = useCallback((id, macros) => {
    patchNutrition(id, () => ({
      manual: {
        calories: macros.calories ?? 0,
        fat: macros.fat ?? 0,
        carbs: macros.carbs ?? 0,
        protein: macros.protein ?? 0,
      },
    }))
  }, [patchNutrition])
  const exclude = useCallback((id) => {
    patchNutrition(id, () => ({ excluded: true }))
  }, [patchNutrition])
  const clearNutrition = useCallback((id) => {
    setIngredients((prev) => prev.map((it) => (it.id === id ? { ...it, nutrition: null } : it)))
  }, [])

  // Instruction ops
  const editInstruction = useCallback((id, text) => {
    setInstructions((prev) => prev.map((it) => (it.id === id ? { ...it, text } : it)))
  }, [])
  const addInstruction = useCallback(() => {
    setInstructions((prev) => [...prev, { id: newId(), text: '' }])
  }, [])
  const deleteInstruction = useCallback((id) => {
    setInstructions((prev) => prev.filter((it) => it.id !== id))
  }, [])
  const reorderInstructions = useCallback((fromId, toId) => {
    setInstructions((prev) => moveById(prev, fromId, toId))
  }, [])

  const ingredientTexts = useMemo(() => deriveIngredientTexts(ingredients), [ingredients])
  const instructionTexts = useMemo(() => deriveInstructionTexts(instructions), [instructions])
  const overrides = useMemo(() => deriveOverrides(ingredients), [ingredients])

  const toPayload = useCallback(() => ({
    ...seed,
    ingredients: ingredientTexts,
    ingredientsData: ingredients,
    instructions: instructionTexts,
  }), [seed, ingredients, ingredientTexts, instructionTexts])

  return {
    ingredients, instructions,
    ingredientTexts, instructionTexts, overrides,
    editIngredientText, addIngredient, deleteIngredient, reorderIngredients,
    setFood, setAmount, setManual, exclude, clearNutrition,
    editInstruction, addInstruction, deleteInstruction, reorderInstructions,
    toPayload,
  }
}
