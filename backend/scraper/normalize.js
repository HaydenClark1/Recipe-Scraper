const he = require('he')

const FRACTIONS = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4',
  '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6',
  '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8',
  '⅐': '1/7', '⅑': '1/9', '⅒': '1/10',
}

function normalizeFractions(str) {
  return str.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⅐⅑⅒]/g, (m) => FRACTIONS[m] || m)
}

function cleanText(input) {
  if (input == null) return ''
  let s = String(input)
  s = he.decode(s)
  s = s.replace(/<[^>]*>/g, ' ')
  s = normalizeFractions(s)
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

function humanizeDuration(iso) {
  if (iso == null) return null
  if (typeof iso !== 'string') iso = String(iso)
  const m = /^P(?:([\d.]+)D)?(?:T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?)?$/.exec(iso.trim())
  if (!m) return iso
  const [, d, h, min] = m
  const parts = []
  if (+d) parts.push(`${+d} day${+d > 1 ? 's' : ''}`)
  if (+h) parts.push(`${+h} hr`)
  if (+min) parts.push(`${+min} min`)
  if (!parts.length) return null
  return parts.join(' ')
}

function normalizeYield(raw) {
  let v = Array.isArray(raw) ? raw[0] : raw
  if (v == null) return null
  v = cleanText(v).replace(/^(serves|makes|yields?)\s+/i, '')
  return v || null
}

function normalizeIngredients(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(cleanText).filter(Boolean)
}

function flattenSteps(raw) {
  const out = []
  const visit = (node) => {
    if (node == null) return
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (typeof node === 'string') { out.push(node); return }
    if (typeof node === 'object') {
      if (node['@type'] === 'HowToSection') { visit(node.itemListElement); return }
      const t = node.text || node.name
      if (t) out.push(String(t))
      else if (node.itemListElement) visit(node.itemListElement)
    }
  }
  visit(raw)
  return out
}

function splitCrammed(steps) {
  if (steps.length !== 1) return steps
  const parts = steps[0]
    .split(/(?<!\d)(?=\d+\.(?:\s|[A-Z]))/g)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 1 ? parts : steps
}

function stripLeadingNumber(s) {
  return s.replace(/^\s*\d+[.)]\s*/, '')
}

function normalizeInstructions(raw) {
  let steps = flattenSteps(raw)
  steps = splitCrammed(steps)
  return steps.map(stripLeadingNumber).map(cleanText).filter(Boolean)
}

module.exports = {
  cleanText, normalizeFractions, humanizeDuration, normalizeYield,
  normalizeIngredients, normalizeInstructions,
}
