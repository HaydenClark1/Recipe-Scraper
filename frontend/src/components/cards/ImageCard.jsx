import './ImageCard.css'

const DB_BUTTON_LABELS = {
  idle: 'Add to database',
  loading: 'Saving…',
  saved: 'Added!',
  duplicate: 'Already in database',
  error: 'Save failed – retry',
}

export function ImageCard({ recipe, isFav, onToggleFav, saveDbState, onSaveToDb }) {
  return (
    <div className="image-card">
      {recipe.image ? (
        <img className="image-card__img" src={recipe.image} alt={recipe.title} />
      ) : (
        <div className="image-card__placeholder">No image available</div>
      )}
      <div className="image-card__content">
        <div className="image-card__header">
          <h1 className="image-card__title">{recipe.title}</h1>
          <button
            className={`image-card__fav ${isFav ? 'image-card__fav--active' : ''}`}
            onClick={onToggleFav}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFav ? '♥' : '♡'}
          </button>
        </div>
        <dl className="image-card__meta">
          {recipe.prepTime && <><dt>Prep</dt><dd>{recipe.prepTime}</dd></>}
          {recipe.totalTime && <><dt>Total</dt><dd>{recipe.totalTime}</dd></>}
          {recipe.servings && <><dt>Serves</dt><dd>{recipe.servings}</dd></>}
          {recipe.category?.length > 0 && (
            <><dt>Category</dt><dd>{[].concat(recipe.category).join(', ')}</dd></>
          )}
          {recipe.cuisine?.length > 0 && (
            <><dt>Cuisine</dt><dd>{[].concat(recipe.cuisine).join(', ')}</dd></>
          )}
        </dl>
        {recipe.source === 'scrape' && (
          <button
            className={`image-card__save-btn image-card__save-btn--${saveDbState}`}
            onClick={onSaveToDb}
            disabled={saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate'}
          >
            {DB_BUTTON_LABELS[saveDbState] ?? 'Add to database'}
          </button>
        )}
      </div>
    </div>
  )
}
