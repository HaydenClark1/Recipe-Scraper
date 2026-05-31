import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './IngredientPopover.css'

export function IngredientPopover({ anchorEl, text, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!anchorEl) return
    const a = anchorEl.getBoundingClientRect()
    setPos({ top: a.top - 8, left: a.left + a.width / 2 })
  }, [anchorEl, text])

  useEffect(() => {
    const onDocPointer = (e) => {
      if (ref.current && !ref.current.contains(e.target) && e.target !== anchorEl) onClose()
    }
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('touchstart', onDocPointer)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('touchstart', onDocPointer)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [anchorEl, onClose])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="ingredient-popover"
      style={{ top: pos.top, left: pos.left }}
    >
      {text}
      <span className="ingredient-popover__arrow" />
    </div>,
    document.body
  )
}
