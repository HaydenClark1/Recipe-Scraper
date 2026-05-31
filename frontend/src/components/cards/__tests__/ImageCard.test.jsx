import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageCard } from '../ImageCard.jsx'

const base = {
  title: 'Banana Bread',
  image: 'https://example.com/img.jpg',
  ingredients: [],
  instructions: [],
  prepTime: 'PT15M',
  totalTime: 'PT1H',
  servings: '8',
  category: ['Bread'],
  cuisine: ['American'],
  source: 'scrape',
}

it('renders title and image', () => {
  render(<ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />)
  expect(screen.getByText('Banana Bread')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/img.jpg')
})

it('shows "Add to database" button only for source=scrape', () => {
  const { rerender } = render(
    <ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />
  )
  expect(screen.getByText('Add to database')).toBeInTheDocument()

  rerender(
    <ImageCard recipe={{ ...base, source: 'search' }} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />
  )
  expect(screen.queryByText('Add to database')).not.toBeInTheDocument()
})

it('shows "Already in database" for duplicate saveDbState', () => {
  render(<ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="duplicate" onSaveToDb={() => {}} />)
  expect(screen.getByText('Already in database')).toBeInTheDocument()
})

it('calls onToggleFav when heart button is clicked', async () => {
  const user = userEvent.setup()
  const onToggleFav = vi.fn()
  render(<ImageCard recipe={base} isFav={false} onToggleFav={onToggleFav} saveDbState="idle" onSaveToDb={() => {}} />)
  await user.click(screen.getByLabelText('Add to favorites'))
  expect(onToggleFav).toHaveBeenCalledOnce()
})
