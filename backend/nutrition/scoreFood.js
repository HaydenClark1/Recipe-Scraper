// Words that should NOT have a trailing 's' stripped (would over-stem)
const SINGULARIZE_GUARD = new Set([
  'molasses', 'hummus', 'couscous', 'asparagus', 'citrus', 'citrus',
  'plus', 'citrus', 'quinoas', 'bias',
])

function singularize(word) {
  const w = word.toLowerCase()
  if (SINGULARIZE_GUARD.has(w)) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (/(?:s|x|z|ch|sh)es$/.test(w) && w.length > 4) return w.slice(0, -2)
  if (w.endsWith('oes') && w.length > 5) return w.slice(0, -2) // tomatoes→tomato
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

// Words whose presence in a food description (but NOT the query) indicate a
// processed/modified form — penalise these.
const PROCESSED_WORDS = new Set([
  'rings', 'breaded', 'fried', 'par', 'frozen', 'unprepared', 'dehydrated',
  'powder', 'powdered', 'juice', 'canned', 'dried', 'paste', 'flakes', 'chips',
  'sauce', 'extract', 'concentrate', 'flavored', 'imitation', 'substitute',
  'coated', 'battered', 'glazed', 'seasoned', 'marinated', 'pickled', 'smoked',
  'instant', 'mix', 'stuffed', 'filled', 'nuggets', 'sticks', 'patties',
])

// Minimum score for a candidate to count as a real match
const MIN_SCORE = 5

function scoreCandidate(query, food) {
  const desc = food.description.toLowerCase()
  const segments = desc.split(',').map((s) => s.trim())
  const primary = segments[0]

  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean)
  const queryWordsSingular = queryWords.map(singularize)
  const primarySingular = singularize(primary)
  // Also singularize each word in the primary segment for word-level comparison
  const primaryWords = primary.split(/\s+/).filter(Boolean)
  const primaryWordsSingular = primaryWords.map(singularize)

  let score = 0
  const descWords = desc.split(/[\s,]+/).map(singularize)

  // Exact primary-segment match after plural normalization (covers Onions,raw → onion)
  if (primarySingular === queryWordsSingular.join(' ') || primarySingular === query.toLowerCase()) {
    score += 30
  } else if (queryWords.length === 1 && primaryWordsSingular.includes(queryWordsSingular[0])) {
    // Single query word matches one word in the primary segment (e.g. "onion" in "yellow onion")
    score += 20
  }

  // At least one query word appears as a whole word in the primary segment
  const anyInPrimary = queryWordsSingular.some((w) => primaryWordsSingular.includes(w))
  if (anyInPrimary) score += 10

  // All query words appear as whole words in primary segment
  const allInPrimary = queryWordsSingular.every((w) =>
    primaryWordsSingular.some((pw) => pw === w)
  )
  if (allInPrimary) score += 15

  // All query words appear anywhere in the description (word-inversion bonus)
  const allInDesc = queryWordsSingular.every((w) => descWords.includes(w))
  if (allInDesc && !allInPrimary) score += 8

  // Penalty: extra comma-segments beyond the first
  const extraSegments = segments.length - 1
  score -= extraSegments * 3

  // Penalty: extra words in primary segment beyond the query word count
  const extraPrimaryWords = Math.max(0, primaryWords.length - queryWords.length)
  score -= extraPrimaryWords * 2

  // Penalty: processed-form words present in the description but not in the query
  const querySet = new Set(queryWordsSingular)
  const descWordSet = new Set(descWords)
  let processedPenalty = 0
  for (const pw of PROCESSED_WORDS) {
    if (descWordSet.has(pw) && !querySet.has(pw)) processedPenalty += 5
  }
  score -= processedPenalty

  return score
}

module.exports = { singularize, scoreCandidate, MIN_SCORE }
