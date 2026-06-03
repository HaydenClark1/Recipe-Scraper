export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export function buildIngredientItems(ingredients) {
  const arr = Array.isArray(ingredients) ? ingredients : []
  return arr.map((el) =>
    typeof el === 'string'
      ? { id: newId(), text: el, nutrition: null }
      : { id: el.id || newId(), text: el.text || '', nutrition: el.nutrition ?? null }
  )
}

export function buildInstructionItems(instructions) {
  const arr = Array.isArray(instructions) ? instructions : []
  return arr.map((el) =>
    typeof el === 'string' ? { id: newId(), text: el } : { id: el.id || newId(), text: el.text || '' }
  )
}

export function deriveIngredientTexts(items) {
  return items.map((i) => i.text)
}

export function deriveInstructionTexts(items) {
  return items.map((i) => i.text)
}

export function deriveOverrides(items) {
  const out = []
  items.forEach((item, index) => {
    const n = item.nutrition
    if (!n) return
    if (n.excluded) { out.push({ index, type: 'exclude' }); return }
    if (n.manual) {
      out.push({
        index, type: 'manual',
        calories: n.manual.calories ?? 0,
        fat: n.manual.fat ?? 0,
        carbs: n.manual.carbs ?? 0,
        protein: n.manual.protein ?? 0,
      })
      return
    }
    if (n.food) {
      const e = { index, type: 'replace', foodName: n.food.foodName, foodDescription: n.food.foodDescription }
      if (n.food.fdcId != null) e.fdcId = n.food.fdcId
      out.push(e)
    }
    if (n.amount) {
      out.push({ index, type: 'amount', quantity: n.amount.quantity, unit: n.amount.unit })
    }
  })
  return out
}

export function moveById(arr, fromId, toId) {
  const from = arr.findIndex((x) => x.id === fromId)
  const to = arr.findIndex((x) => x.id === toId)
  if (from === -1 || to === -1 || from === to) return arr
  const copy = arr.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(to, 0, moved)
  return copy
}
