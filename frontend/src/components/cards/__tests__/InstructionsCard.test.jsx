import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstructionsCard } from '../InstructionsCard.jsx'

const recipe = {
  ingredients: [
    '1/2 tsp Italian seasoning',
    '2 boneless skinless chicken breasts',
    '2 Tbsp butter',
    '2 Tbsp olive oil',
  ],
  instructions: [
    'Season each breast with Italian seasoning, salt, and black pepper.',
    'Heat a large skillet over medium heat and add the olive oil and 1 Tbsp of butter.',
  ],
}

describe('InstructionsCard', () => {
  it('renders all instruction steps', () => {
    render(<InstructionsCard recipe={recipe} />)
    const steps = screen.getAllByRole('listitem')
    expect(steps).toHaveLength(2)
    expect(steps[0].textContent).toMatch(/Season each breast/)
    expect(steps[1].textContent).toMatch(/Heat a large skillet/)
  })

  it('makes an ingredient without an inline amount clickable and shows its amount', async () => {
    const user = userEvent.setup()
    render(<InstructionsCard recipe={recipe} />)
    const btn = screen.getByRole('button', { name: 'Italian seasoning' })
    await user.click(btn)
    expect(screen.getByRole('tooltip')).toHaveTextContent('1/2 tsp Italian seasoning')
  })

  it('does not make "butter" clickable when the amount is already inline', () => {
    render(<InstructionsCard recipe={recipe} />)
    expect(screen.queryByRole('button', { name: 'butter' })).toBeNull()
  })

  it('renders empty state when there are no instructions', () => {
    render(<InstructionsCard recipe={{ ingredients: [], instructions: [] }} />)
    expect(screen.getByText('No instructions found.')).toBeInTheDocument()
  })
})
