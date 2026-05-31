import { describe, it, expect } from 'vitest'
import { hasInlineAmountBefore } from '../inlineAmount.js'

describe('hasInlineAmountBefore', () => {
  it('detects "1 Tbsp of butter"', () => {
    const tokens = ['add', 'the', 'olive', 'oil', 'and', '1', 'tbsp', 'of', 'butter']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('butter'))).toBe(true)
  })

  it('is false when no amount precedes the word', () => {
    const tokens = ['season', 'with', 'italian', 'seasoning']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('italian'))).toBe(false)
  })

  it('detects a bare number with no unit ("2 eggs")', () => {
    const tokens = ['beat', '2', 'eggs']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('eggs'))).toBe(true)
  })

  it('detects a fraction directly before the word', () => {
    const tokens = ['add', '1/2', 'butter']
    expect(hasInlineAmountBefore(tokens, tokens.indexOf('butter'))).toBe(true)
  })

  it('is false at the start of the step', () => {
    expect(hasInlineAmountBefore(['butter'], 0)).toBe(false)
  })
})
