import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { IngredientsEditor } from '../IngredientsEditor.jsx'
import { createWrapper } from '../../lib/testQueryClient.js'

vi.mock('../../api/foods.js', () => ({
  searchFoods: vi.fn((q, source) => Promise.resolve({
    foods: source === 'web'
      ? [{ food_name: 'Egg (web)', food_description: 'Per 1 large - Calories: 72kcal' }]
      : [{ food_name: 'Egg, whole', food_description: 'Per 100g - Calories: 143kcal' }],
  })),
}))

function makeEditor(ingredients) {
  return {
    ingredients,
    editIngredientText: vi.fn(), addIngredient: vi.fn(), deleteIngredient: vi.fn(), reorderIngredients: vi.fn(),
    setFood: vi.fn(), setAmount: vi.fn(), setManual: vi.fn(), exclude: vi.fn(), clearNutrition: vi.fn(),
  }
}

const ingredients = [
  { id: 'a', text: '2 eggs', nutrition: null },
  { id: 'b', text: 'salt', nutrition: { excluded: true } },
]

const wrapper = createWrapper()
const renderWithQuery = (ui) => render(ui, { wrapper })

describe('IngredientsEditor', () => {
  it('renders a text field per ingredient', () => {
    renderWithQuery(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('2 eggs')).toBeInTheDocument()
    expect(screen.getByDisplayValue('salt')).toBeInTheDocument()
  })

  it('editing a field calls editIngredientText with id', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('2 eggs'), { target: { value: '3 eggs' } })
    expect(editor.editIngredientText).toHaveBeenCalledWith('a', '3 eggs')
  })

  it('Add ingredient calls addIngredient', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }))
    expect(editor.addIngredient).toHaveBeenCalled()
  })

  it('Delete calls deleteIngredient with id', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete ingredient/i })[0])
    expect(editor.deleteIngredient).toHaveBeenCalledWith('a')
  })

  it('Exclude calls exclude with id', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^exclude$/i })[0])
    expect(editor.exclude).toHaveBeenCalledWith('a')
  })

  it('replace flow searches and applies a picked food', async () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
    fireEvent.change(screen.getByPlaceholderText(/search foods/i), { target: { value: 'egg' } })
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }))
    await waitFor(() => screen.getByText('Egg, whole'))
    fireEvent.click(screen.getByText('Egg, whole'))
    expect(editor.setFood).toHaveBeenCalledWith('a', expect.objectContaining({ food_name: 'Egg, whole' }))
  })

  it('manual flow applies typed macros', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /manual/i })[0])
    fireEvent.change(screen.getByLabelText(/calories/i), { target: { value: '250' } })
    fireEvent.change(screen.getByLabelText(/^fat$/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/^carbs$/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/^protein$/i), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /apply manual/i }))
    expect(editor.setManual).toHaveBeenCalledWith('a', { calories: 250, fat: 10, carbs: 5, protein: 30 })
  })

  it('amount flow applies quantity/unit from the dropdown', () => {
    const editor = makeEditor(ingredients)
    renderWithQuery(<IngredientsEditor editor={editor} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '0.25' } })
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: 'cup' } })
    fireEvent.click(screen.getByRole('button', { name: /apply amount/i }))
    expect(editor.setAmount).toHaveBeenCalledWith('a', 0.25, 'cup')
  })

  it('unit control is a dropdown listing only supported units', () => {
    renderWithQuery(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    const select = screen.getByLabelText(/^unit$/i)
    expect(select.tagName).toBe('SELECT')
    const optionValues = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(optionValues).toEqual(expect.arrayContaining(['cup', 'g', 'oz']))
    expect(optionValues).not.toContain('clove')
    expect(optionValues).not.toContain('can')
  })

  it('Apply amount is disabled until quantity and unit are both set', () => {
    renderWithQuery(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^amount$/i })[0])
    const apply = screen.getByRole('button', { name: /apply amount/i })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '2' } })
    expect(apply).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/^unit$/i), { target: { value: 'g' } })
    expect(apply).toBeEnabled()
  })
})

describe('IngredientsEditor nutritionItems wiring', () => {
  const nutritionItems = [
    { name: '2 eggs', matched: true, matchedName: 'Egg, whole', grams: 100, needsAmount: false },
    { name: 'salt', matched: false, needsAmount: false },
  ]

  it('shows what each line matched to', () => {
    renderWithQuery(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} nutritionItems={nutritionItems} onClose={vi.fn()} />)
    expect(screen.getByText(/matched to/i)).toBeInTheDocument()
    expect(screen.getByText(/Egg, whole/)).toBeInTheDocument()
  })

  it('shows a needs-amount badge and opens the amount panel', () => {
    const needsItems = [{ id: 'a', text: '1 chicken breast', nutrition: null }]
    const needsNi = [{ name: '1 chicken breast', matched: true, matchedName: 'Chicken breast', grams: null, needsAmount: true }]
    const editor = makeEditor(needsItems)
    renderWithQuery(<IngredientsEditor editor={editor} items={needsItems} nutritionItems={needsNi} onClose={vi.fn()} />)
    const badge = screen.getByRole('button', { name: /needs amount/i })
    fireEvent.click(badge)
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument()
  })

  it('Search the web queries FatSecret and lists results', async () => {
    renderWithQuery(<IngredientsEditor editor={makeEditor(ingredients)} items={ingredients} nutritionItems={nutritionItems} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /replace/i })[0])
    fireEvent.click(screen.getByRole('button', { name: /search the web/i }))
    await waitFor(() => expect(screen.getByText(/Egg \(web\)/)).toBeInTheDocument())
  })
})
