import { describe, it, expect } from 'vitest'
import {
  buildIngredientItems, buildInstructionItems,
  deriveIngredientTexts, deriveInstructionTexts, deriveOverrides, moveById,
} from '../recipeDocument.js'

describe('recipeDocument', () => {
  it('buildIngredientItems wraps plain strings with ids and null nutrition', () => {
    const items = buildIngredientItems(['2 eggs', 'salt'])
    expect(items).toHaveLength(2)
    expect(items[0].text).toBe('2 eggs')
    expect(items[0].nutrition).toBeNull()
    expect(typeof items[0].id).toBe('string')
    expect(items[0].id).not.toBe(items[1].id)
  })

  it('buildIngredientItems passes rich items through (keeping ids + nutrition)', () => {
    const items = buildIngredientItems([{ id: 'a', text: 'x', nutrition: { excluded: true } }])
    expect(items[0]).toEqual({ id: 'a', text: 'x', nutrition: { excluded: true } })
  })

  it('buildInstructionItems wraps strings with ids', () => {
    const items = buildInstructionItems(['mix', 'bake'])
    expect(items.map((i) => i.text)).toEqual(['mix', 'bake'])
    expect(typeof items[0].id).toBe('string')
  })

  it('deriveIngredientTexts / deriveInstructionTexts extract text in order', () => {
    expect(deriveIngredientTexts([{ id: '1', text: 'a' }, { id: '2', text: 'b' }])).toEqual(['a', 'b'])
    expect(deriveInstructionTexts([{ id: '1', text: 'm' }])).toEqual(['m'])
  })

  it('deriveOverrides maps each nutrition type to indexed wire entries', () => {
    const items = [
      { id: '1', text: 'a', nutrition: { excluded: true } },
      { id: '2', text: 'b', nutrition: { manual: { calories: 100, fat: 1, carbs: 2, protein: 3 } } },
      { id: '3', text: 'c', nutrition: { food: { foodName: 'Beef', foodDescription: 'd', fdcId: 9 }, amount: { quantity: 2, unit: 'cup' } } },
      { id: '4', text: 'd', nutrition: null },
    ]
    expect(deriveOverrides(items)).toEqual([
      { index: 0, type: 'exclude' },
      { index: 1, type: 'manual', calories: 100, fat: 1, carbs: 2, protein: 3 },
      { index: 2, type: 'replace', foodName: 'Beef', foodDescription: 'd', fdcId: 9 },
      { index: 2, type: 'amount', quantity: 2, unit: 'cup' },
    ])
  })

  it('moveById moves an item to the target position', () => {
    const arr = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveById(arr, 'a', 'c').map((x) => x.id)).toEqual(['b', 'c', 'a'])
    expect(moveById(arr, 'c', 'a').map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(moveById(arr, 'a', 'a')).toBe(arr)
  })
})
