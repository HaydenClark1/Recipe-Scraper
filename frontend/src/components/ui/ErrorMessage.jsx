import './ErrorMessage.css'

export function ErrorMessage({ message, onRetry }) {
  return (
    <div className="error-wrap" role="alert">
      <p className="error-text">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="error-retry" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}
