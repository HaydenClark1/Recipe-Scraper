import { describe, it, expect } from 'vitest'
import { parseIngredientLine } from '../ingredientParser.js'

describe('parseIngredientLine', () => {
  it('splits quantity, unit, and name', () => {
    const r = parseIngredientLine('1/2 tsp Italian seasoning')
    expect(r.amountText).toBe('1/2 tsp')
    expect(r.name).toBe('Italian seasoning')
    expect(r.display).toBe('1/2 tsp Italian seasoning')
  })

  it('handles a count with no unit', () => {
    const r = parseIngredientLine('2 boneless skinless chicken breasts')
    expect(r.amountText).toBe('2')
    expect(r.name).toBe('boneless skinless chicken breasts')
    expect(r.display).toBe('2 boneless skinless chicken breasts')
  })

  it('drops prep notes after a comma for name and display', () => {
    const r = parseIngredientLine('1 Tbsp butter, melted')
    expect(r.amountText).toBe('1 Tbsp')
    expect(r.name).toBe('butter')
    expect(r.display).toBe('1 Tbsp butter')
  })

  it('drops parentheticals', () => {
    const r = parseIngredientLine('1 cup flour (sifted)')
    expect(r.name).toBe('flour')
  })

  it('handles mixed numbers and ranges', () => {
    expect(parseIngredientLine('1 1/2 cups sugar').amountText).toBe('1 1/2 cups')
    expect(parseIngredientLine('2-3 cloves garlic').amountText).toBe('2-3 cloves')
  })

  it('handles an amount-less line', () => {
    const r = parseIngredientLine('Salt and pepper to taste')
    expect(r.amountText).toBeNull()
    expect(r.display).toBe('Salt and pepper to taste')
  })

  it('builds match terms including singular/plural head noun', () => {
    const r = parseIngredientLine('2 boneless skinless chicken breasts')
    expect(r.matchTerms).toContain('boneless skinless chicken breasts')
    expect(r.matchTerms).toContain('breast')
    expect(r.matchTerms).toContain('breasts')
  })

  it('includes the full multiword name as a match term', () => {
    expect(parseIngredientLine('1/2 tsp Italian seasoning').matchTerms)
      .toContain('italian seasoning')
  })
})
