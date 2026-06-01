// Evaluate plain numbers, fractions (1/2), and mixed numbers (1 1/2) from basis strings.
function evalBasisQty(text) {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = text.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function parseFoodDescription(desc) {
  if (!desc || typeof desc !== 'string') return null
  const dash = desc.indexOf(' - ')
  if (dash === -1) return null

  const basisText = desc.slice(0, dash).replace(/^Per\s+/i, '').trim()
  const macroText = desc.slice(dash + 3)

  const get = (label) => {
    const m = macroText.match(new RegExp(label + '\\s*:\\s*([0-9.]+)', 'i'))
    return m ? Number(m[1]) : null
  }
  const calories = get('Calories')
  if (calories == null) return null
  const fat = get('Fat')
  const carbs = get('Carbs')
  const protein = get('Protein')

  let basis
  const massM = basisText.match(/^([\d.]+)\s*g(?:ram)?s?$/i)
  if (massM) {
    basis = { type: 'mass', grams: Number(massM[1]) }
  } else {
    // Split on spaces and try to parse the first 1 or 2 tokens as a quantity,
    // supporting plain numbers, fractions (1/2), and mixed numbers (1 1/2).
    const tokens = basisText.split(/\s+/)
    let count = null
    let unitStart = 0

    const oneToken = evalBasisQty(tokens[0])
    if (oneToken != null) {
      count = oneToken
      unitStart = 1
      // Try absorbing a second token for mixed numbers like "1 1/2"
      if (tokens.length >= 2) {
        const twoToken = evalBasisQty(tokens[0] + ' ' + tokens[1])
        if (twoToken != null && twoToken !== oneToken) {
          count = twoToken
          unitStart = 2
        }
      }
    }

    if (count != null && unitStart < tokens.length) {
      basis = { type: 'unit', count, unit: tokens.slice(unitStart).join(' ').toLowerCase().trim() }
    } else {
      basis = { type: 'serving' }
    }
  }
  return { basis, calories, fat, carbs, protein }
}

module.exports = { parseFoodDescription }
