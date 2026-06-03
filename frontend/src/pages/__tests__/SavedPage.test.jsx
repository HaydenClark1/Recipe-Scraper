import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SavedPage } from '../SavedPage.jsx'

vi.mock('../../hooks/useSavedRecipes.js', () => ({
  useSavedRecipes: () => ({
    list: [
      { id: 1, title: 'Chicken Soup', image: null, ingredients: ['chicken'], instructions: [] },
      { id: 2, title: 'Veggie Stir Fry', image: null, ingredients: ['broccoli'], instructions: [] },
    ],
  }),
}))

vi.mock('../../context/RecipeContext.jsx', () => ({
  useRecipe: () => ({ setRecipe: vi.fn() }),
}))

vi.mock('../../api/savedRecipes.js', () => ({
  listSavedRecipes: vi.fn().mockResolvedValue({ recipes: [] }),
  createSavedRecipe: vi.fn(),
  deleteSavedRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  searchSavedRecipes: vi.fn().mockResolvedValue({
    recipes: [{ id: 2, title: 'Veggie Stir Fry', image: null, ingredients: ['broccoli'], instructions: [] }],
  }),
}))

describe('SavedPage search', () => {
  it('lists all saved recipes initially', () => {
    render(<MemoryRouter><SavedPage /></MemoryRouter>)
    expect(screen.getByText('Chicken Soup')).toBeInTheDocument()
    expect(screen.getByText('Veggie Stir Fry')).toBeInTheDocument()
  })

  it('typing a query shows server search results', async () => {
    render(<MemoryRouter><SavedPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('searchbox', { name: /search saved recipes/i }), { target: { value: 'veggie' } })
    await waitFor(() => expect(screen.queryByText('Chicken Soup')).not.toBeInTheDocument())
    expect(screen.getByText('Veggie Stir Fry')).toBeInTheDocument()
  })
})
