import './ImageCard.css'

const DB_BUTTON_LABELS = {
  idle: 'Add to database',
  loading: 'Saving…',
  saved: 'Added!',
  duplicate: 'Already in database',
  error: 'Save failed – retry',
}

function HeartFilledIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="m11.645 20.91-.007-.003-.022-.012a15.247 15.247 0 0 1-.383-.218 25.18 25.18 0 0 1-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0 1 12 5.052 5.5 5.5 0 0 1 16.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 0 1-4.244 3.17 15.247 15.247 0 0 1-.383.219l-.022.012-.007.004-.003.001a.752.752 0 0 1-.704 0l-.003-.001Z" />
    </svg>
  )
}

function HeartOutlineIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
    </svg>
  )
}

function MetaPill({ label, value }) {
  return (
    <div className="image-card__meta-pill">
      <span className="image-card__meta-label">{label}</span>
      <span className="image-card__meta-value">{value}</span>
    </div>
  )
}

export function ImageCard({ recipe, isFav, onToggleFav, saveDbState, onSaveToDb }) {
  return (
    <div className="image-card">
      {recipe.image ? (
        <img className="image-card__img" src={recipe.image} alt={recipe.title} />
      ) : (
        <div className="image-card__placeholder">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          No image available
        </div>
      )}
      <div className="image-card__content">
        <div className="image-card__header">
          <h1 className="image-card__title">{recipe.title}</h1>
          <button
            className={`image-card__fav${isFav ? ' image-card__fav--active' : ''}`}
            onClick={onToggleFav}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFav ? <HeartFilledIcon /> : <HeartOutlineIcon />}
          </button>
        </div>
        {(recipe.prepTime || recipe.totalTime || recipe.servings || recipe.category?.length > 0 || recipe.cuisine?.length > 0) && (
          <div className="image-card__meta">
            {recipe.prepTime && <MetaPill label="Prep" value={recipe.prepTime} />}
            {recipe.totalTime && <MetaPill label="Total" value={recipe.totalTime} />}
            {recipe.servings && <MetaPill label="Serves" value={recipe.servings} />}
            {recipe.category?.length > 0 && <MetaPill label="Category" value={[].concat(recipe.category).join(', ')} />}
            {recipe.cuisine?.length > 0 && <MetaPill label="Cuisine" value={[].concat(recipe.cuisine).join(', ')} />}
          </div>
        )}
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
