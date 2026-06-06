# Server-State Caching & Rate Limiting (future-plans #1)

**Date:** 2026-06-04
**Status:** Approved (design)

## Summary

future-plans #1 reads "Redux, caching, and rate limiting for API calls." The
app's actual need is **server-state management** (caching, dedup,
stale-while-revalidate) plus **rate limiting** to protect the backend and stay
under FatSecret's free-tier quota — not centralized client state. We adopt
**TanStack Query (React Query)** on the frontend and add **rate limiting +
outbound caching** on the backend. Redux is intentionally not used: the only
shared client state is "the current recipe," already handled by `RecipeContext`.

## Current state (as built)

- Frontend state: `RecipeContext` (current recipe) + hooks (`useSavedRecipes`,
  `useRecipeEditor`). No caching layer; `NutritionCard` and the food-search
  `ReplacePanel` fetch directly in effects/handlers via `frontend/src/api/*`.
- `frontend/src/api/client.js` wraps `fetch` with auth + error handling and exposes
  `apiClient/apiGet/apiDelete/apiPut`. `BASE_URL` comes from `VITE_API_URL`.
- Backend: `app.use(cors())` (open), no rate limiting. Expensive/external
  endpoints: `/scrape-recipe` (Puppeteer), `/search-foods` (USDA in-memory +
  FatSecret), `/get-nutrition` (FatSecret/USDA). FatSecret client
  (`backend/nutrition/fatsecretClient.js`) makes uncached, unthrottled OAuth calls.

## Design

### Frontend — React Query
- Add `@tanstack/react-query`; create one `QueryClient` and wrap the app in
  `QueryClientProvider`. Sensible defaults: `staleTime` minutes-scale,
  `refetchOnWindowFocus: false`, limited retries.
- Keep `RecipeContext` for UI selection state. No Redux.
- Replace direct fetches with hooks (thin wrappers over existing `api/*`):
  - `useNutrition(recipe)` — `useQuery` keyed by the recipe's nutrition signature
    (same shape as plan #11). For saved recipes with stored nutrition, seed
    `initialData` from the saved row so no request is made until an edit changes
    the key. `NutritionCard`'s `useEffect` fetch is removed.
  - `useFoodSearch(q, source)` — `useQuery` (enabled when `q.length >= 2`), keyed by
    `["foods", source, q]`, so repeated Replace/web searches for the same term are
    served from cache. `ReplacePanel` consumes it.
  - `useSavedRecipes` — `useQuery(["saved-recipes"])`; `add/remove/update` become
    `useMutation`s that invalidate (or optimistically update) the list.
  - `useScrape` — `useMutation` (results not cached client-side; scrape caching is
    server-side / #10).

### Backend — rate limiting + outbound caching
- **Inbound:** add `express-rate-limit`. A lenient global limiter, plus stricter
  per-route limiters on `/scrape-recipe`, `/search-foods`, `/get-nutrition`.
  Configure `app.set('trust proxy', 1)` for Render so client IPs are correct.
- **Outbound FatSecret:** wrap the FatSecret client in (a) a small in-memory cache
  keyed by normalized query with a TTL, and (b) a concurrency/rate limiter (token
  bucket or `p-limit` + min-interval) so bursts stay under the per-second/per-day
  free-tier limits. USDA is in-memory (no external call) and needs neither.

## Cross-cutting

- **Testing (TDD):**
  - Frontend: `useNutrition` seeds from `initialData` and refetches when the key
    changes; `useFoodSearch` dedups identical queries; saved-recipe mutations
    invalidate the list. Use a `QueryClientProvider` test wrapper with retries off.
  - Backend: rate limiter returns 429 past the cap; FatSecret cache returns the
    cached value within TTL (assert underlying client called once); limiter caps
    concurrency.
- **Config:** rate-limit windows/caches tunable via env with safe defaults.
- **Mobile-first:** loading/empty/error states reuse existing `Spinner`/empty
  patterns; React Query status flags drive them.

## Out of scope
- Redux / RTK (explicitly rejected for this app's needs).
- DB-backed scrape/URL caching and crowd overrides (#10).
- Persisted saved-recipe nutrition (#11 — depended upon, not re-implemented here).

## Sequencing
Build **after** plan #11. `useNutrition`'s cache seeds from the persisted
nutrition that #11 introduces; doing #11 first keeps the nutrition query trivial.
