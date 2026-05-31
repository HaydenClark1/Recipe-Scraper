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

  it('does not highlight an ingredient used as a compound modifier (e.g. "pasta water")', () => {
    const pasta = parseIngredientLine('8 oz pasta')
    const segs = buildSegments('Use some pasta water to loosen the sauce.', [pasta])
    expect(clickable(segs)).not.toContain('pasta')
  })

  it('still highlights the ingredient when it stands alone after a connector', () => {
    const pasta = parseIngredientLine('8 oz pasta')
    const segs = buildSegments('Drain the pasta and serve.', [pasta])
    expect(clickable(segs)).toContain('pasta')
  })

  it('still highlights the ingredient when it ends the sentence', () => {
    const pasta = parseIngredientLine('8 oz pasta')
    const segs = buildSegments('Boil the pasta.', [pasta])
    expect(clickable(segs)).toContain('pasta')
  })

  it('exposes the matched ingredient so the popover can show its amount', () => {
    const segs = buildSegments('Sprinkle Italian seasoning over top.', ingredients)
    const seg = segs.find((s) => s.ingredient)
    expect(seg.ingredient.display).toBe('1/2 tsp Italian seasoning')
  })

  it('highlights the protein word when it is not the head noun ("chicken" in "chicken breasts")', () => {
    const step = 'Dust chicken with Seasoning, pan fry in the butter, remove. Deglaze with wine, melt in butter, serve sauce on chicken.'
    const segs = buildSegments(step, ingredients)
    expect(clickable(segs)).toContain('chicken')
  })

  it('highlights "garlic" when the ingredient is formatted as "N garlic cloves"', () => {
    const garlic = parseIngredientLine('4 garlic cloves')
    const step = 'Heat the olive oil in a large skillet or Dutch oven over medium heat. Add the shallot, zucchini, salt, red pepper flakes, and several grinds of pepper. Cook, stirring occasionally, for 15 to 20 minutes, or until the mixture is thick and jammy. Stir in the garlic.'
    const segs = buildSegments(step, [garlic])
    expect(clickable(segs)).toContain('garlic')
  })
})
