import { hasInlineAmountBefore } from './inlineAmount.js'
import { UNITS } from './ingredientParser.js'

// Words that, when following a matched ingredient, indicate the ingredient is
// standalone (not a compound modifier like "pasta" in "pasta water").
const CONNECTOR_WORDS = new Set([
  'and', 'or', 'to', 'of', 'the', 'with', 'for', 'a', 'an',
  'in', 'on', 'at', 'by', 'into', 'onto', 'over', 'under', 'about',
  'as', 'up', 'through', 'between', 'during', 'from', 'off', 'out',
  'when', 'while', 'before', 'after', 'until', 'then', 'so', 'if',
  'but', 'yet', 'nor',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'they', 'them', 'their', 'you', 'your', 'we', 'our',
  'this', 'that', 'these', 'those',
])

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

  const allMatchTerms = new Set()
  const candidates = []
  for (const ing of parsedIngredients) {
    for (const term of ing.matchTerms) {
      allMatchTerms.add(term)
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
      if (c.words.length === 1) {
        const nextIdx = i + 1
        if (nextIdx < words.length) {
          const rawToken = text.slice(words[i].start, words[i].end)
          const tokenEndsClean = !/[^\p{L}\p{N}]$/u.test(rawToken)
          if (tokenEndsClean) {
            const nextNorm = lw[nextIdx]
            if (
              !CONNECTOR_WORDS.has(nextNorm) &&
              !UNITS.has(nextNorm) &&
              /\p{L}/u.test(nextNorm) &&
              !allMatchTerms.has(`${lw[i]} ${nextNorm}`)
            ) continue
          }
        }
      }
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
