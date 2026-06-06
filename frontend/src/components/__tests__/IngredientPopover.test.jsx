import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IngredientPopover, computePosition } from '../IngredientPopover.jsx'

const VW = 390 // a typical phone width
const VH = 844
const pop = { width: 260, height: 60 }
// helper to build an anchor rect at a given x with a small height near top
const anchorAt = (left, top = 400) => ({ left, top, width: 40, height: 20, bottom: top + 20, right: left + 40 })

describe('computePosition (off-screen clamping)', () => {
  it('keeps the popover on-screen when the anchor is near the right edge', () => {
    const { left } = computePosition(anchorAt(VW - 30), pop, VW, VH)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + pop.width).toBeLessThanOrEqual(VW - 8)
  })

  it('keeps the popover on-screen when the anchor is near the left edge', () => {
    const { left } = computePosition(anchorAt(2), pop, VW, VH)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left + pop.width).toBeLessThanOrEqual(VW - 8)
  })

  it('flips below the anchor when there is no room above', () => {
    const { placement, top } = computePosition(anchorAt(100, 4), pop, VW, VH)
    expect(placement).toBe('bottom')
    expect(top).toBeGreaterThanOrEqual(8)
  })

  it('places above the anchor when there is room', () => {
    const { placement } = computePosition(anchorAt(100, 400), pop, VW, VH)
    expect(placement).toBe('top')
  })

  it('keeps the arrow inside the popover bounds near an edge', () => {
    const { arrowLeft } = computePosition(anchorAt(VW - 30), pop, VW, VH)
    expect(arrowLeft).toBeGreaterThanOrEqual(12)
    expect(arrowLeft).toBeLessThanOrEqual(pop.width - 12)
  })

  it('arrow points exactly at the anchor centre when the popover is not clamped', () => {
    const { left, arrowLeft } = computePosition(anchorAt(180), pop, VW, VH)
    const anchorCenter = 180 + 20
    expect(Math.round(left + arrowLeft)).toBe(anchorCenter)
  })
})

function makeAnchor() {
  const el = document.createElement('button')
  document.body.appendChild(el)
  return el
}

describe('IngredientPopover', () => {
  it('renders the amount text as a tooltip', () => {
    render(
      <IngredientPopover anchorEl={makeAnchor()} text="1/2 tsp Italian seasoning" onClose={() => {}} />
    )
    expect(screen.getByRole('tooltip')).toHaveTextContent('1/2 tsp Italian seasoning')
  })

  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    render(<IngredientPopover anchorEl={makeAnchor()} text="2 eggs" onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })
})
