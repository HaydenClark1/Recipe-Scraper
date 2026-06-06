const THRESHOLD = 0.60

// Compare original scraped texts against the user's current rich items.
// Returns one correction object per detected change per line.
function detectCorrections(originalTexts, richItems) {
  const corrections = []
  ;(richItems || []).forEach((item, index) => {
    const original = (originalTexts || [])[index] ?? ''

    if (item.text !== original) {
      corrections.push({
        ingredientIndex: index,
        originalText: original,
        correctionType: 'text',
        correctionData: JSON.stringify({ text: item.text }),
      })
    }

    const n = item.nutrition
    if (!n) return

    if (n.excluded) {
      corrections.push({ ingredientIndex: index, originalText: original, correctionType: 'exclude', correctionData: null })
    } else if (n.manual) {
      corrections.push({ ingredientIndex: index, originalText: original, correctionType: 'manual', correctionData: JSON.stringify(n.manual) })
    } else {
      if (n.food) {
        corrections.push({
          ingredientIndex: index,
          originalText: original,
          correctionType: 'replace',
          correctionData: JSON.stringify({ foodName: n.food.foodName, foodDescription: n.food.foodDescription, fdcId: n.food.fdcId }),
        })
      }
      if (n.amount) {
        corrections.push({
          ingredientIndex: index,
          originalText: original,
          correctionType: 'amount',
          correctionData: JSON.stringify({ quantity: n.amount.quantity, unit: n.amount.unit }),
        })
      }
    }
  })
  return corrections
}

// Given all UrlCorrection rows for a URL and the total number of saves,
// return an array of crowd override objects for lines that meet the threshold.
function aggregateCorrections(rows, totalSaves, threshold = THRESHOLD) {
  if (!rows.length || !totalSaves) return []

  // Group by ingredientIndex
  const byIndex = new Map()
  for (const row of rows) {
    const group = byIndex.get(row.ingredientIndex) ?? []
    group.push(row)
    byIndex.set(row.ingredientIndex, group)
  }

  const results = []
  for (const [index, group] of byIndex) {
    // Count occurrences of each specific (type, data) pair
    const counts = new Map()
    for (const row of group) {
      const key = `${row.correctionType}||${row.correctionData ?? ''}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    // The specific value itself must reach the threshold — a 50/50 split never fires
    let bestKey = null
    let bestCount = 0
    for (const [key, count] of counts) {
      if (count > bestCount) { bestCount = count; bestKey = key }
    }
    if (bestCount / totalSaves < threshold) continue

    const [type, dataStr] = bestKey.split('||')
    const data = dataStr ? JSON.parse(dataStr) : null

    if (type === 'text') {
      results.push({ type: 'text', index, correctedText: data.text })
    } else if (type === 'exclude') {
      results.push({ index, type: 'exclude' })
    } else if (type === 'manual') {
      results.push({ index, type: 'manual', ...data })
    } else if (type === 'replace') {
      results.push({ index, type: 'replace', ...data })
    } else if (type === 'amount') {
      results.push({ index, type: 'amount', ...data })
    }
  }

  return results
}

module.exports = { detectCorrections, aggregateCorrections, THRESHOLD }
