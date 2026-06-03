import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'
import * as recipesApi from '../../../api/recipes.js'

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
    expect(getNutrition).toHaveBeenCalledWith(['2 cups flour', '3 eggs'], '4', []))
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

describe('NutritionCard editing', () => {
  beforeEach(() => {
    recipesApi.getNutrition.mockReset()
    recipesApi.getNutrition.mockResolvedValue({
      perServing: { calories: 100, fat: 1, carbs: 1, protein: 1 },
      totals: { calories: 200, fat: 2, carbs: 2, protein: 2 },
      items: [{ name: '2 chicken breasts', matched: true, matchedName: 'chicken broth', calories: 14, excluded: false }],
      servings: 2,
    })
  })

  it('passes overrides into getNutrition', async () => {
    const recipe = { ingredients: ['2 chicken breasts'], servings: '2' }
    render(<NutritionCard recipe={recipe} overrides={[{ index: 0, type: 'exclude' }]} actions={{}} />)
    await waitFor(() => expect(recipesApi.getNutrition).toHaveBeenCalledWith(recipe.ingredients, recipe.servings, [{ index: 0, type: 'exclude' }]))
  })

  it('calls onEdit when Edit ingredients button is clicked', async () => {
    const recipe = { ingredients: ['2 chicken breasts'], servings: '2' }
    const onEdit = vi.fn()
    render(<NutritionCard recipe={recipe} overrides={[]} onEdit={onEdit} />)
    await waitFor(() => screen.getByRole('button', { name: /edit ingredients/i }))
    fireEvent.click(screen.getByRole('button', { name: /edit ingredients/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
