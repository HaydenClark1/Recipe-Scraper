import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InstructionsCard } from '../InstructionsCard.jsx'

vi.mock('../../../api/recipes.js', () => ({
  parseIngredients: vi.fn().mockResolvedValue([
    { name: 'flour' },
    { name: 'eggs' },
  ]),
}))

const recipe = {
  ingredients: ['2 cups flour', '3 eggs'],
  instructions: ['Mix flour and eggs together', 'Pour into pan'],
}

it('renders all instruction steps', async () => {
  render(<InstructionsCard recipe={recipe} />)
  expect(screen.getByText(/Mix flour/)).toBeInTheDocument()
  expect(screen.getByText(/Pour into pan/)).toBeInTheDocument()
})

it('highlights ingredient names in steps after loading', async () => {
  render(<InstructionsCard recipe={recipe} />)
  await waitFor(() => {
    const marks = document.querySelectorAll('mark.highlight')
    expect(marks.length).toBeGreaterThan(0)
  })
})

it('renders without error if parseIngredients fails', async () => {
  const { parseIngredients } = await import('../../../api/recipes.js')
  parseIngredients.mockRejectedValueOnce(new Error('API down'))
  render(<InstructionsCard recipe={recipe} />)
  await waitFor(() => {
    expect(screen.getByText(/Mix flour/)).toBeInTheDocument()
  })
})
