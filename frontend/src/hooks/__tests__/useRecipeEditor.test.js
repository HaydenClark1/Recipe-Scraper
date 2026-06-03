import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRecipeEditor } from '../useRecipeEditor.js'

const baseRecipe = {
  title: 'Soup', servings: '2',
  ingredients: ['2 eggs', 'salt'],
  instructions: ['mix', 'cook'],
}

describe('useRecipeEditor', () => {
  it('seeds ingredient and instruction items and derives texts', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    expect(result.current.ingredientTexts).toEqual(['2 eggs', 'salt'])
    expect(result.current.instructionTexts).toEqual(['mix', 'cook'])
    expect(result.current.overrides).toEqual([])
  })

  it('edits, adds, and deletes ingredient text', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const firstId = result.current.ingredients[0].id
    act(() => result.current.editIngredientText(firstId, '3 eggs'))
    expect(result.current.ingredientTexts[0]).toBe('3 eggs')
    act(() => result.current.addIngredient())
    expect(result.current.ingredients).toHaveLength(3)
    const lastId = result.current.ingredients[2].id
    act(() => result.current.deleteIngredient(lastId))
    expect(result.current.ingredients).toHaveLength(2)
  })

  it('reorders ingredients by id', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [a, b] = result.current.ingredients.map((i) => i.id)
    act(() => result.current.reorderIngredients(a, b))
    expect(result.current.ingredientTexts).toEqual(['salt', '2 eggs'])
  })

  it('applies nutrition actions and derives overrides; nutrition follows the line on reorder', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [a, b] = result.current.ingredients.map((i) => i.id)
    act(() => result.current.setFood(a, { food_name: 'Egg', food_description: 'd', fdcId: 1 }))
    act(() => result.current.setAmount(a, 3, 'unit'))
    act(() => result.current.setManual(b, { calories: 0, fat: 0, carbs: 0, protein: 0 }))
    act(() => result.current.exclude(b))
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'replace', foodName: 'Egg', foodDescription: 'd', fdcId: 1 },
      { index: 0, type: 'amount', quantity: 3, unit: 'unit' },
      { index: 1, type: 'exclude' },
    ])
    act(() => result.current.reorderIngredients(a, b))
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'exclude' },
      { index: 1, type: 'replace', foodName: 'Egg', foodDescription: 'd', fdcId: 1 },
      { index: 1, type: 'amount', quantity: 3, unit: 'unit' },
    ])
  })

  it('setManual clears a prior exclude on the same line and vice versa', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const a = result.current.ingredients[0].id
    act(() => result.current.exclude(a))
    act(() => result.current.setManual(a, { calories: 50 }))
    expect(result.current.ingredients[0].nutrition).toEqual({ manual: { calories: 50, fat: 0, carbs: 0, protein: 0 } })
  })

  it('edits, adds, deletes, reorders instructions', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const [m, c] = result.current.instructions.map((i) => i.id)
    act(() => result.current.editInstruction(m, 'stir'))
    expect(result.current.instructionTexts[0]).toBe('stir')
    act(() => result.current.addInstruction())
    expect(result.current.instructions).toHaveLength(3)
    act(() => result.current.reorderInstructions(m, c))
    expect(result.current.instructionTexts.slice(0, 2)).toEqual(['cook', 'stir'])
    const lastId = result.current.instructions[2].id
    act(() => result.current.deleteInstruction(lastId))
    expect(result.current.instructions).toHaveLength(2)
  })

  it('toPayload merges base fields with the current document', () => {
    const { result } = renderHook(() => useRecipeEditor(baseRecipe))
    const payload = result.current.toPayload()
    expect(payload.title).toBe('Soup')
    expect(payload.instructions).toEqual(['mix', 'cook'])
    expect(payload.ingredientsData.map((i) => i.text)).toEqual(['2 eggs', 'salt'])
  })
})
