import './Spinner.css'

export function Spinner({ message }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" role="status" aria-label="Loading" />
      {message && <p className="spinner-msg">{message}</p>}
    </div>
  )
}
