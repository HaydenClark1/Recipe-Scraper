import './SearchResultItem.css'

export function SearchResultItem({ recipe, onClick }) {
  return (
    <button className="search-result-item" onClick={onClick}>
      {recipe.image ? (
        <img
          className="search-result-thumb"
          src={recipe.image}
          alt={recipe.title}
          loading="lazy"
        />
      ) : (
        <div className="search-result-thumb search-result-thumb--empty" aria-hidden="true" />
      )}
      <span className="search-result-body">
        <span className="search-result-title">{recipe.title}</span>
      </span>
      <svg className="search-result-arrow" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </button>
  )
}
