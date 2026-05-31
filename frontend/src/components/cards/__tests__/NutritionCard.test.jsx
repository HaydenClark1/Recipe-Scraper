import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'

vi.mock('../../../api/recipes.js', () => ({
  parseIngredients: vi.fn(),
  getNutrition: vi.fn(),
}))

import { getNutrition } from '../../../api/recipes.js'

const recipe = { ingredients: ['2 cups flour', '3 eggs'] }

it('shows spinner while loading', () => {
  getNutrition.mockReturnValue(new Promise(() => {}))
  render(<NutritionCard recipe={recipe} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('renders nutrition items on success', async () => {
  getNutrition.mockResolvedValue({
    nutrition: [
      { name: 'Flour', description: '100 kcal' },
      { name: 'Eggs', description: '70 kcal' },
    ],
  })
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument())
  expect(screen.getByText('Eggs')).toBeInTheDocument()
})

it('shows unavailable message on error', async () => {
  getNutrition.mockRejectedValue(new Error('Network error'))
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(screen.getByText('Nutrition data unavailable.')).toBeInTheDocument()
  )
})
