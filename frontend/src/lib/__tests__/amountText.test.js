import { describe, it, expect } from 'vitest'
import { replaceLeadingAmount, formatQuantity } from '../amountText.js'

describe('formatQuantity', () => {
  it('renders without trailing zeros or float noise', () => {
    expect(formatQuantity(2)).toBe('2')
    expect(formatQuantity(0.25)).toBe('0.25')
    expect(formatQuantity(0.1 + 0.2)).toBe('0.3')
  })
  it('returns empty string for non-numbers', () => {
    expect(formatQuantity(null)).toBe('')
    expect(formatQuantity(NaN)).toBe('')
  })
})

describe('replaceLeadingAmount', () => {
  it('replaces an existing quantity + unit', () => {
    expect(replaceLeadingAmount('1/2 cup flour', 0.25, 'cup')).toBe('0.25 cup flour')
  })
  it('replaces a bare leading quantity (no unit)', () => {
    expect(replaceLeadingAmount('2 eggs', 0.25, 'cup')).toBe('0.25 cup eggs')
  })
  it('prepends an amount when the line has none', () => {
    expect(replaceLeadingAmount('salt', 1, 'tsp')).toBe('1 tsp salt')
  })
  it('preserves commas and prep notes in the name', () => {
    expect(replaceLeadingAmount('2 boneless, skinless chicken thighs', 200, 'g'))
      .toBe('200 g boneless, skinless chicken thighs')
  })
  it('preserves parenthetical content', () => {
    expect(replaceLeadingAmount('2 Jalapeno (40 grams)', 40, 'g')).toBe('40 g Jalapeno (40 grams)')
  })
})
