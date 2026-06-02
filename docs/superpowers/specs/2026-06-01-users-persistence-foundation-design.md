# Users & Persistence Foundation — Design Spec (Project 1 of 2)

**Date:** 2026-06-01
**Status:** Approved (design)

## Context: two-project decomposition

The broader goal is letting users **edit ingredient nutrition matches** (swap the
matched food, adjust quantity/unit, add missing items) and have those corrections
**persist per user**. That requires a place to store corrections, owned by a user —
which the app does not have today. So the work is split:

- **Project 1 (this spec):** Users & persistence foundation — auth + DB-backed
  saved recipes. Prerequisite for persistent edits.
- **Project 2 (later spec):** Ingredient editing UI + persisted overrides — the
  replace-match popup, `/search-foods`, add-missing, live recompute, and an
  `IngredientOverride` table hanging off `SavedRecipe`.

This spec covers **Project 1 only**.

## Goal

Add full email/password authentication and move a user's saved recipes from
device-local storage into per-user rows in MSSQL (via Prisma), establishing the
data model and auth that Project 2's persisted overrides will build on.

## Current state (what changes, what doesn't)

- **Favorites** (the "Saved Recipes" page) are stored per-device in **Capacitor
  Preferences** (`useFavorites` hook). Each is a full recipe object
  `{ id, title, ingredients, instructions, image, source }`. → **Migrates** to
  DB-backed, per-user `SavedRecipe` rows.
- **Global recipe catalog** — `/search-recipies` searches a shared
  `FoodData.csv`; `/save-recipe` appends to it. This is recipe *discovery*, a
  separate concern. → **Unchanged.** Personal saves go to `SavedRecipe`, not the
  CSV.
- **`apiClient`** is POST-only with no auth header. → **Reworked** for
  method support + bearer token.
- **Routing** (`createHashRouter`) has no auth guard. → **Gains** `/login`,
  `/signup`, and a guard.

## Key Decisions

| Decision | Choice |
|----------|--------|
| Auth | Full email/password: signup + login, hashed passwords, JWT sessions |
| Password hashing | `bcryptjs` (pure-JS; avoids native build issues on Windows alongside puppeteer) |
| JWT signing | `jsonwebtoken` (already a backend dependency) |
| Token storage (frontend) | Capacitor Preferences (consistent with existing favorites storage) |
| Saved recipes | Per-user `SavedRecipe` rows in MSSQL via Prisma |
| Global catalog CSV | Untouched (out of scope) |
| Device-favorites migration | Not auto-imported (out of scope; existing local favorites stay local until re-saved) |
| `IngredientOverride` table | Deferred to Project 2 |

## Data Model (Prisma — added to existing `schema.prisma`)

```prisma
model User {
  id           Int           @id @default(autoincrement())
  email        String        @unique @db.NVarChar(255)
  passwordHash String        @db.NVarChar(255)
  createdAt    DateTime      @default(now())
  savedRecipes SavedRecipe[]
}

model SavedRecipe {
  id           Int      @id @default(autoincrement())
  userId       Int
  user         User     @relation(fields: [userId], references: [id])
  title        String   @db.NVarChar(500)
  image        String?  @db.NVarChar(1000)
  ingredients  String   @db.NVarChar(Max)  // JSON-encoded string array
  instructions String   @db.NVarChar(Max)  // JSON-encoded string array
  servings     String?  @db.NVarChar(50)
  sourceUrl    String?  @db.NVarChar(1000)
  createdAt    DateTime @default(now())

  @@index([userId])
}
```

`ingredients`/`instructions` are JSON strings (read as whole recipes, never
queried field-wise). The existing `Food` model is unchanged.

## Backend

**New files (keep `server.js` lean):**
- `backend/auth/passwords.js` — `hashPassword(plain)` / `verifyPassword(plain, hash)` over `bcryptjs`. (Pure, unit-testable.)
- `backend/auth/tokens.js` — `signToken(payload)` / `verifyToken(token)` over `jsonwebtoken` using `JWT_SECRET`. (Pure, unit-testable.)
- `backend/auth/authMiddleware.js` — Express middleware: reads `Authorization: Bearer <token>`, verifies, sets `req.userId`; responds 401 on missing/invalid/expired.
- `backend/auth/authRoutes.js` — `POST /auth/signup`, `POST /auth/login`.
- `backend/recipes/savedRecipeRoutes.js` — `GET /saved-recipes`, `POST /saved-recipes`, `DELETE /saved-recipes/:id` (all behind `authMiddleware`, scoped to `req.userId`).

**Routes & contracts:**
- `POST /auth/signup { email, password }` → `201 { token, user: { id, email } }`; `409` on duplicate email; `400` on missing/invalid input.
- `POST /auth/login { email, password }` → `200 { token, user }`; `401` on bad credentials.
- `GET /saved-recipes` → `200 { recipes: [SavedRecipe...] }` for `req.userId`.
- `POST /saved-recipes { recipe }` → `201 { recipe }` (serializes ingredients/instructions to JSON).
- `DELETE /saved-recipes/:id` → `204`; `404` if not owned by `req.userId`.

**`server.js`:** mount the new routers; add `JWT_SECRET` to `.env` / `.env.example`. Existing `/scrape-recipe`, `/search-recipies`, `/save-recipe`, `/get-nutrition` unchanged.

## Frontend

**New files:**
- `src/context/AuthContext.jsx` — holds `{ token, user }`; exposes `login`, `signup`, `logout`; loads/persists token via Capacitor Preferences; provides `isAuthenticated`.
- `src/pages/LoginPage.jsx`, `src/pages/SignupPage.jsx` — email/password forms with error display.
- `src/hooks/useSavedRecipes.js` — replaces `useFavorites`; same shape
  (`{ list, add, remove, isSaved }`) but backed by the saved-recipe endpoints.
- `src/api/auth.js` — `signup(email, password)`, `login(email, password)`.
- `src/api/savedRecipes.js` — `listSavedRecipes()`, `saveRecipe(recipe)`, `deleteSavedRecipe(id)`.

**Modified:**
- `src/api/client.js` — accept an HTTP method (GET/POST/DELETE), auto-attach
  `Authorization: Bearer <token>` from Preferences, and on `401` clear the token
  and redirect to `/login`.
- `src/App.jsx` — wrap in `AuthProvider`; add `/login` + `/signup` routes; guard
  the tab routes and `/recipe` so unauthenticated users are redirected to `/login`.
- `src/pages/SavedPage.jsx`, `src/pages/RecipeDetailPage.jsx` — swap
  `useFavorites` for `useSavedRecipes` (minimal change thanks to matched hook shape).
- `src/components/TabBar.jsx` — add a logout affordance (or a profile/account entry).

## Data Flow

**Signup/login:** form → `AuthContext.signup/login` → `/auth/*` → `{ token, user }`
→ token persisted to Preferences, user in context → redirect to `/scrape`.

**Authenticated request:** `apiClient` reads token from Preferences → adds
`Authorization` header → backend `authMiddleware` verifies → handler uses
`req.userId`.

**Save a recipe:** RecipeDetailPage heart → `useSavedRecipes.add(recipe)` →
`POST /saved-recipes` → row created for `req.userId`. SavedPage lists via
`GET /saved-recipes`.

## Error Handling

- Duplicate email → `409`, surfaced as "Email already registered."
- Bad credentials → `401`, surfaced as "Incorrect email or password."
- Expired/invalid token → `401`; `apiClient` clears token + redirects to `/login`.
- Network errors → existing `apiClient` error shape (`err.status`, `err.data`).

## Testing

**Backend (`node --test`, mocked Prisma):**
- `passwords.js` — hash differs from plaintext; verify true for correct, false for wrong.
- `tokens.js` — round-trip sign/verify; verify rejects tampered/expired tokens.
- `authMiddleware.js` — valid token sets `req.userId`; missing/invalid/expired → 401.
- `authRoutes` — signup hashes + returns token; duplicate email → 409; login verifies; wrong password → 401.
- `savedRecipeRoutes` — list/create/delete scoped to `req.userId`; deleting another user's recipe → 404.

**Frontend (Vitest + Testing Library):**
- `AuthContext` — login stores token + user; logout clears them.
- `apiClient` — attaches bearer token; on 401 clears token.
- `useSavedRecipes` — add/remove/isSaved call the right endpoints.

## Out of Scope

- Ingredient editing UI and persisted overrides (Project 2).
- Global recipe-catalog CSV behavior.
- Auto-migrating existing device-local favorites into the DB.
- Password reset / email verification / OAuth (future).

## Success Criteria

- A new user can sign up, log in, and stays logged in across app restarts (token in Preferences).
- Saving a recipe persists it to MSSQL under that user; the Saved page lists only their recipes; another user cannot see or delete them.
- Unauthenticated users are redirected to `/login`; expired tokens bounce to `/login`.
- All backend + frontend tests pass; existing scrape/search/nutrition features are unaffected.
