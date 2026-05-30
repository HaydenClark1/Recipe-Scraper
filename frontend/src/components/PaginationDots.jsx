import './PaginationDots.css'

export function PaginationDots({ total, current }) {
  return (
    <div className="pagination-dots" role="tablist" aria-label="Recipe sections">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`dot ${i === current ? 'dot--active' : ''}`}
          role="tab"
          aria-selected={i === current}
        />
      ))}
    </div>
  )
}
