import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { RecipeDetailPage } from '../RecipeDetailPage.jsx'
import { makeTestQueryClient } from '../../lib/testQueryClient.js'

vi.mock('../../api/recipes.js', () => ({
  getNutrition: vi.fn().mockResolvedValue({
    perServing: { calories: 100, fat: 1, carbs: 1, protein: 1 },
    totals: { calories: 200, fat: 2, carbs: 2, protein: 2 },
    items: [{ name: '2 eggs', matched: true, matchedName: 'egg', calories: 140, excluded: false }],
    servings: 2,
  }),
  saveRecipe: vi.fn(),
}))

vi.mock('../../api/savedRecipes.js', () => ({
  listSavedRecipes: vi.fn().mockResolvedValue({ recipes: [] }),
  createSavedRecipe: vi.fn().mockResolvedValue({ recipe: { id: 1 } }),
  deleteSavedRecipe: vi.fn(),
  updateRecipe: vi.fn().mockResolvedValue({ recipe: {} }),
}))

vi.mock('../../context/RecipeContext.jsx', () => ({
  useRecipe: () => ({ recipe: { title: 'Soup', servings: '2', ingredients: ['2 eggs', 'salt'], instructions: ['mix'], sourceUrl: 'http://x' } }),
}))

vi.mock('../../components/RecipeCarousel.jsx', () => ({
  RecipeCarousel: ({ slides }) => <div>{slides}</div>,
}))

function Wrapper({ children }) {
  return (
    <QueryClientProvider client={makeTestQueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RecipeDetailPage editing', () => {
  it('opens the ingredients editor from the NutritionCard edit button', async () => {
    render(<RecipeDetailPage />, { wrapper: Wrapper })
    const btns = await screen.findAllByRole('button', { name: /edit ingredients/i })
    fireEvent.click(btns[0])
    expect(screen.getByRole('dialog', { name: /edit ingredients/i })).toBeInTheDocument()
  })

  it('does not show an edit instructions button on the InstructionsCard', async () => {
    render(<RecipeDetailPage />, { wrapper: Wrapper })
    await screen.findAllByRole('button', { name: /edit ingredients/i })
    const editInstructionsBtns = screen.queryAllByRole('button', { name: /edit instructions/i })
    expect(editInstructionsBtns).toHaveLength(0)
  })
})
