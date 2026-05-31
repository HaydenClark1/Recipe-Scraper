import { describe, it, expect } from 'vitest'
import { buildSegments } from '../highlightInstruction.js'
import { parseIngredientLine } from '../ingredientParser.js'

const ingredients = [
  '1/2 tsp Italian seasoning',
  '2 boneless skinless chicken breasts',
  '2 Tbsp butter',
  '2 Tbsp olive oil',
].map(parseIngredientLine)

function clickable(segs) {
  return segs.filter((s) => s.ingredient).map((s) => s.text)
}

describe('buildSegments', () => {
  it('makes an ingredient without an inline amount clickable', () => {
    const step = 'Season each breast with Italian seasoning, salt, and black pepper.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).toContain('Italian seasoning')
    // "breast" matches the chicken breasts head noun
    expect(clickable(segs)).toContain('breast')
  })

  it('does not make a word clickable when the amount is already inline', () => {
    const step = 'Heat a large skillet and add the olive oil and 1 Tbsp of butter.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).not.toContain('butter')
  })

  it('reassembles the full original text across segments', () => {
    const step = 'Season each breast with Italian seasoning, salt, and black pepper.'
    const segs = buildSegments(step, ingredients)
    expect(segs.map((s) => s.text).join('')).toBe(step)
  })

  it('keeps trailing punctuation out of the clickable span', () => {
    const step = 'Add Italian seasoning, then stir.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).toContain('Italian seasoning')
    expect(clickable(segs)).not.toContain('Italian seasoning,')
  })

  it('returns the whole step as one plain segment when nothing matches', () => {
    const segs = buildSegments('Preheat the oven to 350 degrees.', ingredients)
    expect(segs).toEqual([{ text: 'Preheat the oven to 350 degrees.', ingredient: null }])
  })

  it('exposes the matched ingredient so the popover can show its amount', () => {
    const segs = buildSegments('Sprinkle Italian seasoning over top.', ingredients)
    const seg = segs.find((s) => s.ingredient)
    expect(seg.ingredient.display).toBe('1/2 tsp Italian seasoning')
  })
})
