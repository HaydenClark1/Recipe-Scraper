import { useState, useCallback } from 'react'

export function useIngredientOverrides(initial = []) {
  const [overrides, setOverrides] = useState(initial)

  const upsert = useCallback((index, type, fields) => {
    setOverrides((prev) => {
      const rest = prev.filter((o) => !(o.index === index && o.type === type))
      return [...rest, { index, type, ...fields }]
    })
  }, [])

  const removeType = useCallback((index, type) => {
    setOverrides((prev) => prev.filter((o) => !(o.index === index && o.type === type)))
  }, [])

  const replace = useCallback((index, food) => {
    const fields = { foodName: food.food_name, foodDescription: food.food_description }
    if (food.fdcId != null) fields.fdcId = food.fdcId
    upsert(index, 'replace', fields)
  }, [upsert])

  const setAmount = useCallback((index, quantity, unit) => {
    upsert(index, 'amount', { quantity, unit })
  }, [upsert])

  const exclude = useCallback((index) => upsert(index, 'exclude', {}), [upsert])
  const unexclude = useCallback((index) => removeType(index, 'exclude'), [removeType])

  return { overrides, replace, setAmount, exclude, unexclude }
}
