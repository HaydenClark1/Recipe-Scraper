function generateId(title, image) {
  const str = `${title}::${image || ''}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return String(Math.abs(hash))
}

function splitInstructions(text) {
  if (!text) return []
  const byNewline = text.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  const byNumber = text.split(/(?=\d+\.\s)/g).map(s => s.trim()).filter(Boolean)
  if (byNumber.length > 1) return byNumber
  return byNewline
}

export function normalizeScraped(data) {
  const clean = (val) => (val === 'N/A' || val == null) ? null : val
  return {
    id: generateId(data.title || '', data.image),
    title: data.title || '',
    image: data.image || null,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    instructions: Array.isArray(data.instructions) ? data.instructions : [],
    prepTime: clean(data.prepTime),
    totalTime: clean(data.totalTime),
    servings: clean(data.servings),
    category: Array.isArray(data.category)
      ? data.category
      : (data.category ? [data.category] : []),
    cuisine: Array.isArray(data.cuisine)
      ? data.cuisine
      : (data.cuisine ? [data.cuisine] : []),
    source: 'scrape',
  }
}

export function normalizeSearchResult(item) {
  const ingredients = typeof item.Cleaned_Ingredients === 'string'
    ? item.Cleaned_Ingredients
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(s => s.trim().replace(/^'+|'+$/g, ''))
        .filter(Boolean)
    : []

  const instructions = typeof item.Instructions === 'string'
    ? splitInstructions(item.Instructions)
    : []

  const image = item.Image_Name || null

  return {
    id: generateId(item.Title || '', image),
    title: item.Title || '',
    image,
    ingredients,
    instructions,
    prepTime: null,
    totalTime: null,
    servings: null,
    category: [],
    cuisine: [],
    source: 'search',
  }
}
