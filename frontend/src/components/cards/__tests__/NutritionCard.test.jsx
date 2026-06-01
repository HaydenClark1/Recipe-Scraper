import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'

vi.mock('../../../api/recipes.js', () => ({ getNutrition: vi.fn() }))
import { getNutrition } from '../../../api/recipes.js'

const recipe = { ingredients: ['2 cups flour', '3 eggs'], servings: '4' }

const payload = {
  servings: 4,
  totals: { calories: 1840, fat: 92.5, carbs: 130.2, protein: 110.7 },
  perServing: { calories: 460, fat: 23.1, carbs: 32.6, protein: 27.7 },
  items: [
    { name: 'flour', matched: true, grams: 480, calories: 1748, fat: 4.7, carbs: 366, protein: 49.6 },
    { name: 'eggs', matched: false, grams: null, calories: 0, fat: 0, carbs: 0, protein: 0 },
  ],
  estimated: true,
}

it('shows spinner while loading', () => {
  getNutrition.mockReturnValue(new Promise(() => {}))
  render(<NutritionCard recipe={recipe} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('renders the per-serving calories and macros on success', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText('460')).toBeInTheDocument())
  expect(screen.getByText('Total Fat')).toBeInTheDocument()
  expect(screen.getByText('23.1g')).toBeInTheDocument()
})

it('shows how many ingredients were matched', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText(/1\/2 ingredients matched/)).toBeInTheDocument())
})

it('passes servings to getNutrition', async () => {
  getNutrition.mockResolvedValue(payload)
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(getNutrition).toHaveBeenCalledWith(['2 cups flour', '3 eggs'], '4'))
})

it('shows unavailable message on error', async () => {
  getNutrition.mockRejectedValue(new Error('Network error'))
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(screen.getByText('Nutrition data unavailable.')).toBeInTheDocument())
})

it('shows empty message when there are no ingredients', () => {
  render(<NutritionCard recipe={{ ingredients: [], servings: null }} />)
  expect(screen.getByText('No nutrition data found.')).toBeInTheDocument()
})
