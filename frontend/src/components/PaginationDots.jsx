import './PaginationDots.css'

export function PaginationDots({ total, current, labels }) {
  return (
    <div className="pagination-dots" role="tablist" aria-label="Recipe sections">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`dot${i === current ? ' dot--active' : ''}`}
          role="tab"
          aria-selected={i === current}
          aria-label={labels?.[i]}
        >
          {labels?.[i] && <span className="dot-label">{labels[i]}</span>}
        </div>
      ))}
    </div>
  )
}
