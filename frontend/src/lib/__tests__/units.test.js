import { describe, it, expect } from 'vitest'
import { SUPPORTED_UNITS } from '../units.js'

describe('SUPPORTED_UNITS', () => {
  const values = SUPPORTED_UNITS.map((u) => u.value)

  it('includes the canonical convertible units', () => {
    for (const v of ['g', 'kg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'pint', 'quart', 'gallon']) {
      expect(values).toContain(v)
    }
  })

  it('includes a count (each) option', () => {
    expect(values).toContain('each')
  })

  it('excludes non-convertible words', () => {
    for (const v of ['clove', 'can', 'slice', 'stick', 'pinch', 'dash', 'handful', 'package']) {
      expect(values).not.toContain(v)
    }
  })

  it('has lowercase values and non-empty labels and groups', () => {
    for (const u of SUPPORTED_UNITS) {
      expect(u.value).toBe(u.value.toLowerCase())
      expect(u.label.length).toBeGreaterThan(0)
      expect(['Mass', 'Volume', 'Count']).toContain(u.group)
    }
  })

  it('has no duplicate values', () => {
    expect(new Set(values).size).toBe(values.length)
  })
})
