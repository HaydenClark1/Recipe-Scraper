import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EditIngredientsModal } from '../EditIngredientsModal.jsx'

vi.mock('../../api/foods.js', () => ({
  searchFoods: vi.fn().mockResolvedValue({ foods: [{ food_name: 'Chicken breast, grilled', food_description: 'Per 100g - Calories: 165kcal' }] }),
}))

const ingredients = ['2 chicken breasts', 'salt to taste']
const items = [
  { name: '2 chicken breasts', matched: true, matchedName: 'chicken broth', calories: 14, excluded: false },
  { name: 'salt to taste', matched: true, matchedName: 'salt', calories: 0, excluded: false },
]

function setup(extra = {}) {
  const actions = { replace: vi.fn(), setAmount: vi.fn(), exclude: vi.fn(), unexclude: vi.fn() }
  render(<EditIngredientsModal ingredients={ingredients} items={items} overrides={[]} actions={actions} onClose={vi.fn()} {...extra} />)
  return actions
}

describe('EditIngredientsModal', () => {
  it('lists every ingredient with its current match', () => {
    setup()
    expect(screen.getByText('2 chicken breasts')).toBeInTheDocument()
    expect(screen.getByText(/chicken broth/)).toBeInTheDocument()
  })

  it('exclude calls actions.exclude with the row index', () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /exclude/i })[0])
    expect(actions.exclude).toHaveBeenCalledWith(0)
  })

  it('replace flow searches and applies a picked food', async () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value: 'chicken breast' } })
    fireEvent.click(screen.getByRole('button', { name: /search/i }))
    await waitFor(() => screen.getByText('Chicken breast, grilled'))
    fireEvent.click(screen.getByText('Chicken breast, grilled'))
    expect(actions.replace).toHaveBeenCalledWith(0, expect.objectContaining({ food_name: 'Chicken breast, grilled' }))
  })

  it('amount flow applies a quantity/unit override', () => {
    const actions = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: 'clove' } })
    fireEvent.click(screen.getByRole('button', { name: /apply amount/i }))
    expect(actions.setAmount).toHaveBeenCalledWith(0, 3, 'clove')
  })
})
