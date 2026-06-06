# Security Review & Hardening (future-plans #5)

**Date:** 2026-06-04
**Status:** Approved (approach)

## Summary

future-plans #5 is "Look for security risks and fix." This is an **audit**, not a
feature — the authoritative list of issues comes from running the `/security-review`
skill, after which findings are triaged and fixed. This document seeds the review
with issues already visible from reading the code so none are lost, and records how
we scope the review.

## How we run it

- Invoke **`/security-review`**. Note it reviews a **branch diff**; since work lives
  on `main`, scope it explicitly to the security-relevant files below (entry points,
  auth, scraper, DB access) rather than relying on an empty diff.
- Triage findings by severity, then fix highest-risk first, each with a regression
  test where practical.

## Seed checklist (verify + fix; not exhaustive)

1. **SSRF in `/scrape-recipe`** (`backend/server.js`, `backend/scraper`): Puppeteer
   fetches an arbitrary user-supplied `url`. Block internal/reserved targets
   (localhost, RFC-1918, link-local `169.254.169.254` cloud metadata, non-http(s)
   schemes); validate/normalize the URL before fetching. **Highest priority.**
2. **Open CORS** (`app.use(cors())`): restrict to known frontend origins
   (Capacitor app scheme + any web origin) via an allowlist.
3. **Unauthenticated, unthrottled public endpoints** (`/scrape-recipe`,
   `/search-foods`, `/get-nutrition`, `/search-recipies`): expensive and/or hit
   external APIs. Add rate limiting (shared with plan #1) and consider auth where
   appropriate.
4. **`JWT_SECRET` default** (`change_me_to_a_long_random_string`): refuse to start
   in production without a strong secret set.
5. **Secrets hygiene:** confirm `.env` is gitignored and not committed; rotate the
   Neon password and FatSecret keys that were shared in plaintext during setup.
6. **Input validation:** bound and validate request bodies (URL format, ingredient
   array length/size, query length) to prevent abuse / resource exhaustion.
7. **Dependency audit:** `npm audit` on backend and frontend; patch high/criticals.
8. **Error/response hygiene:** ensure internal errors aren't leaked to clients;
   confirm auth tokens/PII aren't logged.

## Testing
- Regression tests for the SSRF guard (rejects internal/again-loopback/metadata
  URLs, accepts normal recipe URLs) and the production `JWT_SECRET` guard.
- Rate-limit tests are shared with plan #1.

## Out of scope
- Full pen-test / threat-model exercise beyond the `/security-review` output.
- Rearchitecting auth (current JWT + bcrypt approach is kept; only hardened).

## Sequencing
Independent of #1 and #11, but the rate-limiting fixes are shared with plan #1 —
land them once and reference from both.

## Implemented (2026-06-06, branch feat/security-hardening)

1. **SSRF guard** — `lib/urlGuard.js` (`assertSafeUrl`, `isPrivateIp`): requires
   http(s); blocks loopback/RFC-1918/link-local (incl. 169.254.169.254 metadata)/
   CGNAT/ULA/IPv4-mapped targets via DNS resolution; rejects DNS-rebinding. Wired
   into `scraper/fetch.js` (pre-request + a synchronous redirect guard).
   `/scrape-recipe` returns 400 on a blocked URL.
2. **CORS allowlist** — `lib/corsOptions.js`; `ALLOWED_ORIGINS` env (comma-sep).
   No-Origin requests (native app/curl) pass; empty allowlist = allow-all (dev).
3. **Rate limiting** — landed in plan #1 (`lib/rateLimiter.js`), in place here.
4. **JWT_SECRET production guard** — `lib/envGuard.js` (`checkProductionSecrets`):
   refuses to start when `NODE_ENV=production` and the secret is missing/default/
   <32 chars. Called at server startup.
5. **Secrets hygiene** — confirmed `backend/.env` is gitignored. (Rotation of the
   Neon/FatSecret credentials shared in plaintext remains a manual user action.)
6. **Input validation** — `lib/validate.js`: URL (type/length), ingredients
   (array, <=200 lines, <=1000 chars each), query (2-200 chars); `express.json`
   capped at 256 kb. Wired into `/scrape-recipe`, `/get-nutrition`, `/search-foods`.
7. **Dependency audit** — removed unused `xlsx` (high-severity, no fix available);
   `npm audit` now reports 0 vulnerabilities.
8. **Error hygiene** — endpoints return generic messages; internals logged
   server-side only.

**Deferred:** redirect-following SSRF re-resolution inside Puppeteer; rotating the
exposed credentials (manual); the unused `react-native-*` deps in the backend
package.json (non-security, left in place).
