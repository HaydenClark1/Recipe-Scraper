import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIngredientOverrides } from '../useIngredientOverrides.js'

describe('useIngredientOverrides', () => {
  it('seeds from initial overrides', () => {
    const { result } = renderHook(() => useIngredientOverrides([{ index: 1, type: 'exclude' }]))
    expect(result.current.overrides).toEqual([{ index: 1, type: 'exclude' }])
  })

  it('replace adds/updates a replace override for an index', () => {
    const { result } = renderHook(() => useIngredientOverrides([]))
    act(() => result.current.replace(0, { food_name: 'Chicken', food_description: 'd', fdcId: 9 }))
    expect(result.current.overrides).toEqual([
      { index: 0, type: 'replace', foodName: 'Chicken', foodDescription: 'd', fdcId: 9 },
    ])
    act(() => result.current.replace(0, { food_name: 'Beef', food_description: 'd2' }))
    expect(result.current.overrides.filter((o) => o.type === 'replace')).toHaveLength(1)
    expect(result.current.overrides[0].foodName).toBe('Beef')
  })

  it('setAmount and exclude/unexclude manage their own override rows', () => {
    const { result } = renderHook(() => useIngredientOverrides([]))
    act(() => result.current.setAmount(2, 3, 'clove'))
    act(() => result.current.exclude(2))
    expect(result.current.overrides).toContainEqual({ index: 2, type: 'amount', quantity: 3, unit: 'clove' })
    expect(result.current.overrides).toContainEqual({ index: 2, type: 'exclude' })
    act(() => result.current.unexclude(2))
    expect(result.current.overrides.some((o) => o.index === 2 && o.type === 'exclude')).toBe(false)
  })
})
