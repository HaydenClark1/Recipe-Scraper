import { UNITS } from './ingredientParser.js'

const NUMBER_RE = /^\d+([./]\d+)?$/ // 1, 1.5, 1/2
const CONNECTORS = new Set(['of', 'the'])

function clean(token) {
  return String(token).toLowerCase().replace(/[^a-z0-9/.]/g, '')
}

export function hasInlineAmountBefore(tokens, matchStartIndex) {
  let i = matchStartIndex - 1
  while (i >= 0 && CONNECTORS.has(clean(tokens[i]))) i--
  if (i >= 0 && UNITS.has(clean(tokens[i]))) i--
  if (i >= 0 && NUMBER_RE.test(clean(tokens[i]))) return true
  return false
}
