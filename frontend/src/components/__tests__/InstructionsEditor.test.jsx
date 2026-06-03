import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstructionsEditor } from '../InstructionsEditor.jsx'

function makeEditor(instructions) {
  return {
    instructions,
    editInstruction: vi.fn(), addInstruction: vi.fn(), deleteInstruction: vi.fn(), reorderInstructions: vi.fn(),
  }
}
const steps = [{ id: 'm', text: 'mix' }, { id: 'c', text: 'cook' }]

describe('InstructionsEditor', () => {
  it('renders a field per step', () => {
    render(<InstructionsEditor editor={makeEditor(steps)} items={steps} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue('mix')).toBeInTheDocument()
    expect(screen.getByDisplayValue('cook')).toBeInTheDocument()
  })
  it('editing calls editInstruction with id', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.change(screen.getByDisplayValue('mix'), { target: { value: 'stir' } })
    expect(editor.editInstruction).toHaveBeenCalledWith('m', 'stir')
  })
  it('Add step calls addInstruction', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add step/i }))
    expect(editor.addInstruction).toHaveBeenCalled()
  })
  it('Delete calls deleteInstruction with id', () => {
    const editor = makeEditor(steps)
    render(<InstructionsEditor editor={editor} items={steps} onClose={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /delete step/i })[0])
    expect(editor.deleteInstruction).toHaveBeenCalledWith('m')
  })
})
