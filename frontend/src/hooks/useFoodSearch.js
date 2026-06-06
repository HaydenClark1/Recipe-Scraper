import { useQuery } from '@tanstack/react-query'
import { searchFoods } from '../api/foods.js'

export function useFoodSearch(q, source = 'local') {
  return useQuery({
    queryKey: ['foods', source, q],
    queryFn: () => searchFoods(q, source === 'web' ? 'web' : undefined).then(r => r.foods),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  })
}
