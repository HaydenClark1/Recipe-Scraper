# Plan: Server-State Caching & Rate Limiting (future-plans #1)

**Spec:** `docs/superpowers/specs/2026-06-04-react-query-caching-rate-limiting-design.md`
**Build order:** after the persisted-nutrition plan (#11).

Test-first throughout. Frontend: Vitest + a `QueryClientProvider` test wrapper
(retries off, `gcTime`/`staleTime` set for determinism). Backend: `node:test`.

## Slice 1 — React Query provider
- **Code:** add `@tanstack/react-query`. Create `frontend/src/lib/queryClient.js`
  (defaults: `staleTime` ~5 min, `refetchOnWindowFocus: false`, `retry: 1`). Wrap the
  app root in `QueryClientProvider`. No behavior change yet.
- **Test:** a smoke test that a component under the provider can run a trivial query.

## Slice 2 — Food search via useQuery
- **Test** (`frontend/src/components/__tests__/IngredientsEditor.test.jsx` + a hook
  test): identical `(q, source)` searches hit the API once (cache dedup); switching
  source/term refetches; `<2` char queries stay disabled.
- **Code:** `useFoodSearch(q, source)` (`useQuery`, key `["foods", source, q]`,
  `enabled: q.trim().length >= 2`). `ReplacePanel` uses it instead of its manual
  `useState`/`searchFoods` flow; keep the same UI states.

## Slice 3 — Nutrition via useQuery (seeded from #11)
- **Test:** `useNutrition` seeds from `initialData` (stored nutrition) and does not
  fetch until the key changes; changing the recipe signature triggers a refetch.
- **Code:** `useNutrition(recipe)` keyed by the recipe's nutrition signature; for
  saved recipes pass `initialData: savedRow.nutrition`. `NutritionCard` consumes the
  hook; remove its bespoke `useEffect` fetch (depends on #11 Slice 5).

## Slice 4 — Saved recipes as query + mutations
- **Test:** list is cached; `add`/`remove`/`update` invalidate (or optimistically
  update) `["saved-recipes"]`.
- **Code:** refactor `useSavedRecipes` to `useQuery(["saved-recipes"])` + `useMutation`s.
  Preserve the current hook's public API (`add`, `remove`, `findSaved`, etc.) so
  callers (`RecipeDetailPage`, `SavedPage`) don't change.

## Slice 5 — Scrape as mutation
- **Code:** `useScrape` (`useMutation`) wrapping the scrape call; wire the scrape page
  to mutation status for loading/error. No client-side caching of scrape results.

## Slice 6 — Backend inbound rate limiting
- **Test** (`backend/__tests__/rateLimit.test.js`): requests past the cap return 429;
  under the cap pass through.
- **Code:** add `express-rate-limit`. `app.set('trust proxy', 1)` (Render). A lenient
  global limiter + stricter limiters mounted on `/scrape-recipe`, `/search-foods`,
  `/get-nutrition`. Windows/caps from env with safe defaults. (Shared with security #5.)

## Slice 7 — Outbound FatSecret cache + limiter
- **Test** (`backend/nutrition/__tests__/fatsecretCache.test.js`): repeated lookups of
  the same normalized query within TTL call the underlying client once; limiter caps
  concurrency / enforces a min interval.
- **Code:** wrap `fatsecretClient` calls with an in-memory TTL cache (key = normalized
  query) + a token-bucket / `p-limit`-style limiter, sized under FatSecret's free-tier
  per-second/per-day limits. USDA path unchanged (in-memory, no external call).

## Verification
- `cd frontend && npx vitest run`; `cd backend && node --test` — all green.
- Manual: re-opening the same Replace search shows no new network request; rapid
  repeated requests to a limited endpoint eventually 429; FatSecret-heavy flows make
  far fewer outbound calls.

## Notes / risks
- React Query refactor touches several call sites — keep each hook's public API stable
  to localize change. Land slice-by-slice with the suite green between slices.
- Redux intentionally omitted; revisit only if genuine cross-cutting *client* state
  appears.
