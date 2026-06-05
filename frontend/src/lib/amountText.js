import { UNITS } from './ingredientParser.js'

// Same leading-quantity shape the parsers use (whole, decimal, fraction, mixed, range).
const QTY_RE = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?)\s*/

// Render a numeric quantity without float noise or trailing zeros (0.25 → "0.25", 2 → "2").
export function formatQuantity(n) {
  if (n == null || !Number.isFinite(Number(n))) return ''
  return String(Math.round(Number(n) * 1000) / 1000)
}

// Replace only the leading quantity (+ optional unit) of an ingredient line with a new
// amount, preserving the rest of the line verbatim (parens, commas, prep notes).
// "2 eggs" + (0.25, "cup") → "0.25 cup eggs"; "salt" + (1, "tsp") → "1 tsp salt".
export function replaceLeadingAmount(text, quantity, unit) {
  let work = String(text == null ? '' : text).replace(/^\s+/, '')
  const qty = work.match(QTY_RE)
  if (qty) {
    work = work.slice(qty[0].length)
    const token = work.match(/^(\S+)(?:\s+|$)/)
    if (token && UNITS.has(token[1].toLowerCase().replace(/\.$/, ''))) {
      work = work.slice(token[0].length)
    }
  }
  const rest = work.trim()
  const prefix = [formatQuantity(quantity), unit].filter(Boolean).join(' ')
  return [prefix, rest].filter(Boolean).join(' ').trim()
}
