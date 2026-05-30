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
      <span className="search-result-title">{recipe.title}</span>
    </button>
  )
}
