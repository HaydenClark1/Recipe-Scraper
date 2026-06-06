import { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'

export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

export function createWrapper() {
  const client = makeTestQueryClient()
  return ({ children }) => createElement(QueryClientProvider, { client }, children)
}
