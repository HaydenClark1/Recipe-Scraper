import { hasInlineAmountBefore } from './inlineAmount.js'

function norm(word) {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

export function buildSegments(stepText, parsedIngredients) {
  const text = String(stepText == null ? '' : stepText)

  const words = []
  const re = /\S+/g
  let m
  while ((m = re.exec(text)) !== null) {
    words.push({ start: m.index, end: m.index + m[0].length })
  }
  const lw = words.map((w) => norm(text.slice(w.start, w.end)))

  const candidates = []
  for (const ing of parsedIngredients) {
    for (const term of ing.matchTerms) {
      candidates.push({ ingredient: ing, words: term.split(' ').filter(Boolean), len: term.length })
    }
  }
  candidates.sort((a, b) => b.words.length - a.words.length || b.len - a.len)

  const matchAt = new Array(words.length).fill(null)
  const used = new Array(words.length).fill(false)
  for (const c of candidates) {
    for (let i = 0; i + c.words.length <= words.length; i++) {
      let ok = true
      for (let j = 0; j < c.words.length; j++) {
        if (used[i + j] || lw[i + j] !== c.words[j]) { ok = false; break }
      }
      if (!ok) continue
      for (let j = 0; j < c.words.length; j++) used[i + j] = true
      if (hasInlineAmountBefore(lw, i)) continue
      matchAt[i] = { ingredient: c.ingredient, span: c.words.length }
    }
  }

  const segments = []
  let cursor = 0
  let i = 0
  while (i < words.length) {
    const match = matchAt[i]
    if (match) {
      const startWord = words[i]
      const endWord = words[i + match.span - 1]
      if (startWord.start > cursor) {
        segments.push({ text: text.slice(cursor, startWord.start), ingredient: null })
      }
      let segText = text.slice(startWord.start, endWord.end)
      const trail = segText.match(/[^\p{L}\p{N}]+$/u)
      let trailing = ''
      if (trail) {
        trailing = trail[0]
        segText = segText.slice(0, segText.length - trailing.length)
      }
      segments.push({ text: segText, ingredient: match.ingredient })
      if (trailing) segments.push({ text: trailing, ingredient: null })
      cursor = endWord.end
      i += match.span
    } else {
      i += 1
    }
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), ingredient: null })
  if (segments.length === 0) segments.push({ text, ingredient: null })
  return segments
}
