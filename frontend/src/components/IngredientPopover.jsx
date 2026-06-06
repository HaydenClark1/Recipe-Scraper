import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './IngredientPopover.css'

const MARGIN = 8 // keep this far from the viewport edges

// Pure positioning math: given the anchor and popover rects and the viewport,
// return a placement that never leaves the screen. Exported for testing.
export function computePosition(a, p, vw, vh, margin = MARGIN) {
  const anchorCenter = a.left + a.width / 2
  const left = Math.max(margin, Math.min(anchorCenter - p.width / 2, vw - p.width - margin))

  let placement = 'top'
  let top = a.top - p.height - margin
  if (top < margin) { placement = 'bottom'; top = a.bottom + margin }
  if (placement === 'bottom' && top + p.height > vh - margin) {
    top = Math.max(margin, vh - p.height - margin)
  }

  const arrowLeft = Math.max(12, Math.min(anchorCenter - left, p.width - 12))
  return { top, left, placement, arrowLeft }
}

export function IngredientPopover({ anchorEl, text, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'top', arrowLeft: 0, ready: false })

  // Measure the anchor and the popover, then clamp so it never leaves the viewport.
  useLayoutEffect(() => {
    if (!anchorEl || !ref.current) return
    const place = () => {
      const a = anchorEl.getBoundingClientRect()
      const p = ref.current.getBoundingClientRect()
      const next = computePosition(a, p, window.innerWidth, window.innerHeight)
      setPos({ ...next, ready: true })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
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
      data-placement={pos.placement}
      style={{ top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' }}
    >
      {text}
      <span className="ingredient-popover__arrow" style={{ left: pos.arrowLeft }} />
    </div>,
    document.body
  )
}
