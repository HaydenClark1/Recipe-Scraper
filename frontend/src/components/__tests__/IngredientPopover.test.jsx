import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { IngredientPopover } from '../IngredientPopover.jsx'

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
