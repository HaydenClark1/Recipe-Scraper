import './IngredientsCard.css'

export function IngredientsCard({ recipe }) {
  return (
    <div className="ingredients-card">
      <h2 className="card-heading">Ingredients</h2>
      {recipe.ingredients.length === 0 ? (
        <p className="card-empty">No ingredients found.</p>
      ) : (
        <ul className="ingredients-list">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="ingredients-item">{ing}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
