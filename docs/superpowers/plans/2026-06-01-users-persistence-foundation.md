# Users & Persistence Foundation Implementation Plan (Project 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password authentication (hashed passwords + JWT) and move a user's saved recipes from device-local Capacitor Preferences into per-user MSSQL rows via Prisma.

**Architecture:** Backend gains `User` + `SavedRecipe` Prisma models, pure auth utilities (`passwords`, `tokens`), an auth middleware, and dependency-injected route handler factories (`makeXHandler(prisma)`) so they're unit-testable without HTTP. Frontend gains an `AuthProvider` context (token in Preferences), a reworked `apiClient` that attaches the bearer token and handles 401, login/signup pages with a route guard, and a `useSavedRecipes` hook replacing `useFavorites`.

**Tech Stack:** Node/Express, Prisma (`sqlserver`), `bcryptjs`, `jsonwebtoken`, `node --test`; React 19 + Vite, React Router (hash router), Capacitor Preferences, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-01-users-persistence-foundation-design.md`

---

## File Structure

**Backend — new:**
- `backend/auth/passwords.js` — `hashPassword` / `verifyPassword` (bcryptjs). Pure.
- `backend/auth/tokens.js` — `signToken` / `verifyToken` (jsonwebtoken). Pure.
- `backend/auth/authMiddleware.js` — `makeAuthMiddleware(verifyToken)` → Express middleware.
- `backend/auth/authHandlers.js` — `makeSignupHandler(prisma)`, `makeLoginHandler(prisma)`.
- `backend/auth/authRoutes.js` — `createAuthRouter(prisma)` (thin wiring).
- `backend/recipes/savedRecipeHandlers.js` — `serializeRecipe`, `deserializeRecipe`, `makeListHandler`, `makeCreateHandler`, `makeDeleteHandler`.
- `backend/recipes/savedRecipeRoutes.js` — `createSavedRecipeRouter(prisma, authMiddleware)` (thin wiring).
- Tests: `backend/auth/__tests__/passwords.test.js`, `tokens.test.js`, `authMiddleware.test.js`, `authHandlers.test.js`; `backend/recipes/__tests__/savedRecipeHandlers.test.js`.

**Backend — modified:**
- `backend/prisma/schema.prisma` — add `User`, `SavedRecipe`.
- `backend/server.js` — mount the two routers (reuse existing `prisma`).
- `backend/package.json`, `backend/.env`, `backend/.env.example` — `bcryptjs` dep, `JWT_SECRET`.

**Frontend — new:**
- `src/api/auth.js` — `signup`, `login`.
- `src/api/savedRecipes.js` — `listSavedRecipes`, `createSavedRecipe`, `deleteSavedRecipe`.
- `src/context/AuthContext.jsx` — `AuthProvider`, `useAuth`.
- `src/hooks/useSavedRecipes.js` — `{ list, add, remove, isSaved, findSaved, refresh }`.
- `src/pages/LoginPage.jsx`, `src/pages/SignupPage.jsx` (+ `AuthPage.css`).
- `src/components/RequireAuth.jsx` — route guard.
- Tests: `src/context/__tests__/AuthContext.test.jsx`, `src/hooks/__tests__/useSavedRecipes.test.js`, `src/api/__tests__/auth.test.js`.

**Frontend — modified:**
- `src/api/client.js` — token helpers, bearer header, 401 handling, `apiGet`/`apiDelete`.
- `src/api/__tests__/client.test.js` — mock Preferences.
- `src/App.jsx` — `AuthProvider`, `/login` + `/signup` routes, guard.
- `src/pages/SavedPage.jsx`, `src/pages/RecipeDetailPage.jsx` — use `useSavedRecipes`.
- `src/components/TabBar.jsx` — logout button.

**Contracts:**
```
POST /auth/signup { email, password } -> 201 { token, user:{id,email} } | 400 | 409
POST /auth/login  { email, password } -> 200 { token, user:{id,email} } | 400 | 401
GET    /saved-recipes        -> 200 { recipes: [ {id,title,image,ingredients[],instructions[],servings,sourceUrl,createdAt} ] }
POST   /saved-recipes {recipe}-> 201 { recipe }
DELETE /saved-recipes/:id    -> 200 { deleted: true } | 404
```

---

## Task 1: Prisma models — User + SavedRecipe

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the models**

Append to `backend/prisma/schema.prisma` (after the existing `Food` model):
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
  ingredients  String   @db.NVarChar(Max)
  instructions String   @db.NVarChar(Max)
  servings     String?  @db.NVarChar(50)
  sourceUrl    String?  @db.NVarChar(1000)
  createdAt    DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Push to the database and regenerate the client**

From `backend/` (requires the local MSSQL `recipe_nutrition` DB reachable via `DATABASE_URL`):
```bash
npx prisma db push
```
Expected: `Your database is now in sync with your Prisma schema`, and the Prisma client regenerates with `user` + `savedRecipe` models.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add User and SavedRecipe Prisma models"
```

---

## Task 2: Install bcryptjs and add JWT_SECRET

**Files:**
- Modify: `backend/package.json`, `backend/.env`, `backend/.env.example`

- [ ] **Step 1: Install bcryptjs**

From `backend/`:
```bash
npm install bcryptjs
```
Expected: `bcryptjs` appears in `dependencies`.

- [ ] **Step 2: Add JWT_SECRET to env files**

Append to `backend/.env.example`:
```
# Auth — secret used to sign JWT session tokens (use a long random string in production)
JWT_SECRET=change_me_to_a_long_random_string
```
Append to `backend/.env` (use any long random local value):
```
JWT_SECRET=local_dev_secret_2c8f1a9b4e7d
```

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example
git commit -m "chore: add bcryptjs and JWT_SECRET for auth"
```

---

## Task 3: passwords.js — hashing utilities

**Files:**
- Create: `backend/auth/passwords.js`
- Test: `backend/auth/__tests__/passwords.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/auth/__tests__/passwords.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { hashPassword, verifyPassword } = require('../passwords')

test('hashPassword produces a hash different from the plaintext', async () => {
  const hash = await hashPassword('hunter2')
  assert.notStrictEqual(hash, 'hunter2')
  assert.ok(hash.length > 20)
})

test('verifyPassword returns true for the correct password', async () => {
  const hash = await hashPassword('hunter2')
  assert.strictEqual(await verifyPassword('hunter2', hash), true)
})

test('verifyPassword returns false for a wrong password', async () => {
  const hash = await hashPassword('hunter2')
  assert.strictEqual(await verifyPassword('wrong', hash), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test auth/__tests__/passwords.test.js
```
Expected: FAIL — `Cannot find module '../passwords'`.

- [ ] **Step 3: Write the implementation**

Create `backend/auth/passwords.js`:
```js
const bcrypt = require('bcryptjs')

const SALT_ROUNDS = 10

async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

module.exports = { hashPassword, verifyPassword }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test auth/__tests__/passwords.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/auth/passwords.js backend/auth/__tests__/passwords.test.js
git commit -m "feat: add bcryptjs password hashing utilities"
```

---

## Task 4: tokens.js — JWT sign/verify

**Files:**
- Create: `backend/auth/tokens.js`
- Test: `backend/auth/__tests__/tokens.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/auth/__tests__/tokens.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret'
const { signToken, verifyToken } = require('../tokens')

test('signToken then verifyToken round-trips the payload', () => {
  const token = signToken({ userId: 7, email: 'a@b.com' })
  const payload = verifyToken(token)
  assert.strictEqual(payload.userId, 7)
  assert.strictEqual(payload.email, 'a@b.com')
})

test('verifyToken throws on a tampered token', () => {
  const token = signToken({ userId: 1 })
  assert.throws(() => verifyToken(token + 'x'))
})

test('verifyToken throws on a token signed with a different secret', () => {
  const jwt = require('jsonwebtoken')
  const foreign = jwt.sign({ userId: 1 }, 'other-secret')
  assert.throws(() => verifyToken(foreign))
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test auth/__tests__/tokens.test.js
```
Expected: FAIL — `Cannot find module '../tokens'`.

- [ ] **Step 3: Write the implementation**

Create `backend/auth/tokens.js`:
```js
const jwt = require('jsonwebtoken')

// Read the secret lazily so tests can set process.env.JWT_SECRET before calling.
function secret() {
  return process.env.JWT_SECRET || 'dev-insecure-secret'
}

function signToken(payload) {
  return jwt.sign(payload, secret(), { expiresIn: '7d' })
}

function verifyToken(token) {
  return jwt.verify(token, secret()) // throws on invalid/expired
}

module.exports = { signToken, verifyToken }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test auth/__tests__/tokens.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/auth/tokens.js backend/auth/__tests__/tokens.test.js
git commit -m "feat: add JWT sign/verify utilities"
```

---

## Task 5: authMiddleware.js — protect routes

**Files:**
- Create: `backend/auth/authMiddleware.js`
- Test: `backend/auth/__tests__/authMiddleware.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/auth/__tests__/authMiddleware.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const { makeAuthMiddleware } = require('../authMiddleware')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('sets req.userId and calls next when token is valid', () => {
  const mw = makeAuthMiddleware(() => ({ userId: 42, email: 'a@b.com' }))
  const req = { headers: { authorization: 'Bearer good.token' } }
  const res = mockRes()
  let nextCalled = false
  mw(req, res, () => { nextCalled = true })
  assert.strictEqual(req.userId, 42)
  assert.strictEqual(nextCalled, true)
})

test('401 when Authorization header is missing', () => {
  const mw = makeAuthMiddleware(() => ({ userId: 1 }))
  const res = mockRes()
  let nextCalled = false
  mw({ headers: {} }, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})

test('401 when verifyToken throws (invalid/expired)', () => {
  const mw = makeAuthMiddleware(() => { throw new Error('expired') })
  const res = mockRes()
  let nextCalled = false
  mw({ headers: { authorization: 'Bearer bad' } }, res, () => { nextCalled = true })
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nextCalled, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test auth/__tests__/authMiddleware.test.js
```
Expected: FAIL — `Cannot find module '../authMiddleware'`.

- [ ] **Step 3: Write the implementation**

Create `backend/auth/authMiddleware.js`:
```js
// makeAuthMiddleware(verifyToken) -> Express middleware that requires a valid
// "Authorization: Bearer <token>" header and sets req.userId from the payload.
function makeAuthMiddleware(verifyToken) {
  return function authMiddleware(req, res, next) {
    const header = req.headers && req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    const token = header.slice('Bearer '.length).trim()
    try {
      const payload = verifyToken(token)
      req.userId = payload.userId
      req.userEmail = payload.email
      return next()
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
  }
}

module.exports = { makeAuthMiddleware }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test auth/__tests__/authMiddleware.test.js
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/auth/authMiddleware.js backend/auth/__tests__/authMiddleware.test.js
git commit -m "feat: add JWT auth middleware"
```

---

## Task 6: authHandlers.js + authRoutes.js — signup/login

**Files:**
- Create: `backend/auth/authHandlers.js`, `backend/auth/authRoutes.js`
- Test: `backend/auth/__tests__/authHandlers.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/auth/__tests__/authHandlers.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret'
const { makeSignupHandler, makeLoginHandler } = require('../authHandlers')
const { hashPassword } = require('../passwords')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('signup creates a user and returns a token', async () => {
  const created = []
  const prisma = {
    user: {
      findUnique: async () => null,
      create: async ({ data }) => { created.push(data); return { id: 1, email: data.email } },
    },
  }
  const res = mockRes()
  await makeSignupHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.ok(res.body.token)
  assert.deepStrictEqual(res.body.user, { id: 1, email: 'a@b.com' })
  assert.notStrictEqual(created[0].passwordHash, 'pw123456') // stored hashed
})

test('signup 400 when email or password missing', async () => {
  const res = mockRes()
  await makeSignupHandler({})({ body: { email: 'a@b.com' } }, res)
  assert.strictEqual(res.statusCode, 400)
})

test('signup 409 when email already exists', async () => {
  const prisma = { user: { findUnique: async () => ({ id: 1, email: 'a@b.com' }) } }
  const res = mockRes()
  await makeSignupHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 409)
})

test('login returns a token for correct credentials', async () => {
  const passwordHash = await hashPassword('pw123456')
  const prisma = { user: { findUnique: async () => ({ id: 5, email: 'a@b.com', passwordHash }) } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'a@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.ok(res.body.token)
  assert.deepStrictEqual(res.body.user, { id: 5, email: 'a@b.com' })
})

test('login 401 for wrong password', async () => {
  const passwordHash = await hashPassword('pw123456')
  const prisma = { user: { findUnique: async () => ({ id: 5, email: 'a@b.com', passwordHash }) } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'a@b.com', password: 'WRONG' } }, res)
  assert.strictEqual(res.statusCode, 401)
})

test('login 401 for unknown email', async () => {
  const prisma = { user: { findUnique: async () => null } }
  const res = mockRes()
  await makeLoginHandler(prisma)({ body: { email: 'no@b.com', password: 'pw123456' } }, res)
  assert.strictEqual(res.statusCode, 401)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test auth/__tests__/authHandlers.test.js
```
Expected: FAIL — `Cannot find module '../authHandlers'`.

- [ ] **Step 3: Write the handlers**

Create `backend/auth/authHandlers.js`:
```js
const { hashPassword, verifyPassword } = require('./passwords')
const { signToken } = require('./tokens')

function makeSignupHandler(prisma) {
  return async function signup(req, res) {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' })
    }
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({ data: { email, passwordHash } })
    const token = signToken({ userId: user.id, email: user.email })
    return res.status(201).json({ token, user: { id: user.id, email: user.email } })
  }
}

function makeLoginHandler(prisma) {
  return async function login(req, res) {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Incorrect email or password' })
    }
    const token = signToken({ userId: user.id, email: user.email })
    return res.status(200).json({ token, user: { id: user.id, email: user.email } })
  }
}

module.exports = { makeSignupHandler, makeLoginHandler }
```

- [ ] **Step 4: Write the router (thin wiring, no test)**

Create `backend/auth/authRoutes.js`:
```js
const express = require('express')
const { makeSignupHandler, makeLoginHandler } = require('./authHandlers')

function createAuthRouter(prisma) {
  const router = express.Router()
  router.post('/signup', makeSignupHandler(prisma))
  router.post('/login', makeLoginHandler(prisma))
  return router
}

module.exports = { createAuthRouter }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test auth/__tests__/authHandlers.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/auth/authHandlers.js backend/auth/authRoutes.js backend/auth/__tests__/authHandlers.test.js
git commit -m "feat: add signup/login handlers and auth router"
```

---

## Task 7: savedRecipeHandlers.js + savedRecipeRoutes.js

**Files:**
- Create: `backend/recipes/savedRecipeHandlers.js`, `backend/recipes/savedRecipeRoutes.js`
- Test: `backend/recipes/__tests__/savedRecipeHandlers.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/recipes/__tests__/savedRecipeHandlers.test.js`:
```js
const test = require('node:test')
const assert = require('node:assert')
const {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler,
} = require('../savedRecipeHandlers')

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
  }
}

test('serializeRecipe JSON-encodes arrays and attaches userId', () => {
  const row = serializeRecipe({ title: 'Soup', ingredients: ['a', 'b'], instructions: ['x'] }, 9)
  assert.strictEqual(row.userId, 9)
  assert.strictEqual(row.title, 'Soup')
  assert.strictEqual(row.ingredients, JSON.stringify(['a', 'b']))
  assert.strictEqual(row.instructions, JSON.stringify(['x']))
})

test('deserializeRecipe parses arrays back', () => {
  const r = deserializeRecipe({
    id: 3, title: 'Soup', image: null,
    ingredients: JSON.stringify(['a']), instructions: JSON.stringify(['x']),
    servings: '4', sourceUrl: null, createdAt: 'now',
  })
  assert.deepStrictEqual(r.ingredients, ['a'])
  assert.deepStrictEqual(r.instructions, ['x'])
  assert.strictEqual(r.id, 3)
})

test('list returns the current user\'s recipes (deserialized)', async () => {
  const prisma = { savedRecipe: { findMany: async ({ where }) => {
    assert.strictEqual(where.userId, 9)
    return [{ id: 1, title: 'A', image: null, ingredients: '["i"]', instructions: '["s"]', servings: null, sourceUrl: null, createdAt: 't' }]
  } } }
  const res = mockRes()
  await makeListHandler(prisma)({ userId: 9 }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.recipes.length, 1)
  assert.deepStrictEqual(res.body.recipes[0].ingredients, ['i'])
})

test('create stores a serialized recipe for the user', async () => {
  let createdData = null
  const prisma = { savedRecipe: { create: async ({ data }) => { createdData = data; return { id: 2, ...data, createdAt: 't' } } } }
  const res = mockRes()
  await makeCreateHandler(prisma)({ userId: 9, body: { recipe: { title: 'B', ingredients: ['i'], instructions: ['s'] } } }, res)
  assert.strictEqual(res.statusCode, 201)
  assert.strictEqual(createdData.userId, 9)
  assert.deepStrictEqual(res.body.recipe.ingredients, ['i'])
})

test('create 400 when recipe missing', async () => {
  const res = mockRes()
  await makeCreateHandler({})({ userId: 9, body: {} }, res)
  assert.strictEqual(res.statusCode, 400)
})

test('delete removes only the user\'s recipe', async () => {
  const prisma = { savedRecipe: { deleteMany: async ({ where }) => {
    assert.strictEqual(where.id, 5)
    assert.strictEqual(where.userId, 9)
    return { count: 1 }
  } } }
  const res = mockRes()
  await makeDeleteHandler(prisma)({ userId: 9, params: { id: '5' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.body, { deleted: true })
})

test('delete 404 when nothing was deleted (not owned)', async () => {
  const prisma = { savedRecipe: { deleteMany: async () => ({ count: 0 }) } }
  const res = mockRes()
  await makeDeleteHandler(prisma)({ userId: 9, params: { id: '5' } }, res)
  assert.strictEqual(res.statusCode, 404)
})
```

- [ ] **Step 2: Run test to verify it fails**

From `backend/`:
```bash
node --test recipes/__tests__/savedRecipeHandlers.test.js
```
Expected: FAIL — `Cannot find module '../savedRecipeHandlers'`.

- [ ] **Step 3: Write the handlers**

Create `backend/recipes/savedRecipeHandlers.js`:
```js
function serializeRecipe(recipe, userId) {
  return {
    userId,
    title: recipe.title || '',
    image: recipe.image ?? null,
    ingredients: JSON.stringify(recipe.ingredients || []),
    instructions: JSON.stringify(recipe.instructions || []),
    servings: recipe.servings ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
  }
}

function deserializeRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    image: row.image,
    ingredients: JSON.parse(row.ingredients),
    instructions: JSON.parse(row.instructions),
    servings: row.servings,
    sourceUrl: row.sourceUrl,
    createdAt: row.createdAt,
  }
}

function makeListHandler(prisma) {
  return async function list(req, res) {
    const rows = await prisma.savedRecipe.findMany({ where: { userId: req.userId } })
    return res.status(200).json({ recipes: rows.map(deserializeRecipe) })
  }
}

function makeCreateHandler(prisma) {
  return async function create(req, res) {
    const recipe = req.body && req.body.recipe
    if (!recipe || !recipe.title) {
      return res.status(400).json({ error: 'recipe with a title is required' })
    }
    const row = await prisma.savedRecipe.create({ data: serializeRecipe(recipe, req.userId) })
    return res.status(201).json({ recipe: deserializeRecipe(row) })
  }
}

function makeDeleteHandler(prisma) {
  return async function remove(req, res) {
    const id = Number(req.params.id)
    const { count } = await prisma.savedRecipe.deleteMany({ where: { id, userId: req.userId } })
    if (count === 0) return res.status(404).json({ error: 'Recipe not found' })
    return res.status(200).json({ deleted: true })
  }
}

module.exports = {
  serializeRecipe, deserializeRecipe,
  makeListHandler, makeCreateHandler, makeDeleteHandler,
}
```

- [ ] **Step 4: Write the router (thin wiring, no test)**

Create `backend/recipes/savedRecipeRoutes.js`:
```js
const express = require('express')
const { makeListHandler, makeCreateHandler, makeDeleteHandler } = require('./savedRecipeHandlers')

function createSavedRecipeRouter(prisma, authMiddleware) {
  const router = express.Router()
  router.use(authMiddleware)
  router.get('/', makeListHandler(prisma))
  router.post('/', makeCreateHandler(prisma))
  router.delete('/:id', makeDeleteHandler(prisma))
  return router
}

module.exports = { createSavedRecipeRouter }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test recipes/__tests__/savedRecipeHandlers.test.js
```
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/recipes/savedRecipeHandlers.js backend/recipes/savedRecipeRoutes.js backend/recipes/__tests__/savedRecipeHandlers.test.js
git commit -m "feat: add saved-recipe handlers and router"
```

---

## Task 8: Mount routers in server.js

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: Add the requires**

In `backend/server.js`, just below the existing nutrition requires (after the `const { PrismaClient } = require("@prisma/client");` line), add:
```js
const { createAuthRouter } = require("./auth/authRoutes");
const { createSavedRecipeRouter } = require("./recipes/savedRecipeRoutes");
const { makeAuthMiddleware } = require("./auth/authMiddleware");
const { verifyToken } = require("./auth/tokens");
```

- [ ] **Step 2: Mount the routers**

In `backend/server.js`, immediately after the `initNutrition()` function definition (before the startup IIFE `(async () => {`), add:
```js
app.use("/auth", createAuthRouter(prisma));
app.use("/saved-recipes", createSavedRecipeRouter(prisma, makeAuthMiddleware(verifyToken)));
```
(`prisma` is the instance already created earlier in `server.js` for nutrition.)

- [ ] **Step 3: Start the server and smoke-test auth**

From `backend/`:
```bash
node server.js
```
In a second terminal:
```bash
curl -s -X POST http://localhost:7000/auth/signup -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"pw123456\"}"
```
Expected: JSON with a `token` and `user`. Then test a protected route:
```bash
curl -s http://localhost:7000/saved-recipes
```
Expected: `{"error":"Authentication required"}` (401, no token). Re-run with `-H "Authorization: Bearer <token-from-signup>"` and expect `{"recipes":[]}`.

- [ ] **Step 4: Run the full backend suite**

```bash
npm test
```
Expected: all tests pass (nutrition + new auth/saved-recipe handler tests).

- [ ] **Step 5: Commit**

```bash
git add backend/server.js
git commit -m "feat: mount auth and saved-recipe routers"
```

---

## Task 9: Rework frontend apiClient (token + methods + 401)

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/__tests__/client.test.js`

- [ ] **Step 1: Update the test to mock Preferences and cover token + 401**

Replace the entire contents of `frontend/src/api/__tests__/client.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}))
import { Preferences } from '@capacitor/preferences'
import { apiClient, apiGet, apiDelete } from '../client.js'

beforeEach(() => {
  vi.restoreAllMocks()
  Preferences.get.mockResolvedValue({ value: null })
})

describe('apiClient', () => {
  it('POSTs JSON and returns parsed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ title: 'Pasta' }) })
    vi.stubGlobal('fetch', mockFetch)
    const result = await apiClient('/scrape-recipe', { url: 'https://x.com' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/scrape-recipe$/),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://x.com' }) })
    )
    expect(result).toEqual({ title: 'Pasta' })
  })

  it('attaches a bearer token when one is stored', async () => {
    Preferences.get.mockResolvedValue({ value: 'tok123' })
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) })
    vi.stubGlobal('fetch', mockFetch)
    await apiClient('/saved-recipes', {})
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok123')
  })

  it('clears the token on a 401 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({ error: 'nope' }) })
    vi.stubGlobal('fetch', mockFetch)
    await expect(apiClient('/saved-recipes', {})).rejects.toMatchObject({ status: 401 })
    expect(Preferences.remove).toHaveBeenCalledWith({ key: 'auth-token' })
  })

  it('throws with status and message on non-2xx', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Recipe not found' }) })
    vi.stubGlobal('fetch', mockFetch)
    await expect(apiClient('/scrape-recipe', { url: 'x' })).rejects.toMatchObject({ message: 'Recipe not found', status: 404 })
  })

  it('apiGet issues a GET and apiDelete issues a DELETE', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ recipes: [] }) })
    vi.stubGlobal('fetch', mockFetch)
    await apiGet('/saved-recipes')
    expect(mockFetch.mock.calls[0][1].method).toBe('GET')
    await apiDelete('/saved-recipes/3')
    expect(mockFetch.mock.calls[1][1].method).toBe('DELETE')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/api/__tests__/client.test.js
```
Expected: FAIL — `apiGet`/`apiDelete` are not exported yet; token/401 behavior missing.

- [ ] **Step 3: Rewrite the client**

Replace the entire contents of `frontend/src/api/client.js`:
```js
import { Preferences } from '@capacitor/preferences'

const BASE_URL = import.meta.env?.VITE_API_URL ?? 'https://recipe-scraper-hk6l.onrender.com'
const TOKEN_KEY = 'auth-token'

export async function getToken() {
  const { value } = await Preferences.get({ key: TOKEN_KEY })
  return value || null
}
export async function setToken(token) {
  await Preferences.set({ key: TOKEN_KEY, value: token })
}
export async function clearToken() {
  await Preferences.remove({ key: TOKEN_KEY })
}

async function request(path, { method = 'POST', body } = {}) {
  const token = await getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    await clearToken()
    if (typeof window !== 'undefined') window.location.hash = '#/login'
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.message || data.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

// Backward-compatible POST helper (existing callers use apiClient(path, body)).
export const apiClient = (path, body) => request(path, { method: 'POST', body })
export const apiGet = (path) => request(path, { method: 'GET' })
export const apiDelete = (path) => request(path, { method: 'DELETE' })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/__tests__/client.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Run the existing recipes API test (no regression)**

```bash
npx vitest run src/api/__tests__/recipes.test.js
```
Expected: PASS — existing `apiClient(path, body)` callers unaffected.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/__tests__/client.test.js
git commit -m "feat: apiClient attaches bearer token, adds GET/DELETE and 401 handling"
```

---

## Task 10: Frontend auth + savedRecipes API modules

**Files:**
- Create: `frontend/src/api/auth.js`, `frontend/src/api/savedRecipes.js`
- Test: `frontend/src/api/__tests__/auth.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/api/__tests__/auth.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as client from '../client.js'

vi.mock('../client.js', () => ({
  apiClient: vi.fn(),
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('auth api', () => {
  it('signup posts to /auth/signup', async () => {
    client.apiClient.mockResolvedValue({ token: 't' })
    const { signup } = await import('../auth.js')
    await signup('a@b.com', 'pw')
    expect(client.apiClient).toHaveBeenCalledWith('/auth/signup', { email: 'a@b.com', password: 'pw' })
  })

  it('login posts to /auth/login', async () => {
    client.apiClient.mockResolvedValue({ token: 't' })
    const { login } = await import('../auth.js')
    await login('a@b.com', 'pw')
    expect(client.apiClient).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'pw' })
  })
})

describe('savedRecipes api', () => {
  it('listSavedRecipes GETs /saved-recipes', async () => {
    client.apiGet.mockResolvedValue({ recipes: [] })
    const { listSavedRecipes } = await import('../savedRecipes.js')
    await listSavedRecipes()
    expect(client.apiGet).toHaveBeenCalledWith('/saved-recipes')
  })

  it('createSavedRecipe POSTs the recipe', async () => {
    client.apiClient.mockResolvedValue({ recipe: {} })
    const { createSavedRecipe } = await import('../savedRecipes.js')
    const recipe = { title: 'X' }
    await createSavedRecipe(recipe)
    expect(client.apiClient).toHaveBeenCalledWith('/saved-recipes', { recipe })
  })

  it('deleteSavedRecipe DELETEs by id', async () => {
    client.apiDelete.mockResolvedValue(null)
    const { deleteSavedRecipe } = await import('../savedRecipes.js')
    await deleteSavedRecipe(3)
    expect(client.apiDelete).toHaveBeenCalledWith('/saved-recipes/3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/api/__tests__/auth.test.js
```
Expected: FAIL — `Cannot find module '../auth.js'`.

- [ ] **Step 3: Write the modules**

Create `frontend/src/api/auth.js`:
```js
import { apiClient } from './client.js'

export const signup = (email, password) =>
  apiClient('/auth/signup', { email, password })

export const login = (email, password) =>
  apiClient('/auth/login', { email, password })
```

Create `frontend/src/api/savedRecipes.js`:
```js
import { apiClient, apiGet, apiDelete } from './client.js'

export const listSavedRecipes = () => apiGet('/saved-recipes')
export const createSavedRecipe = (recipe) => apiClient('/saved-recipes', { recipe })
export const deleteSavedRecipe = (id) => apiDelete(`/saved-recipes/${id}`)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/api/__tests__/auth.test.js
```
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/auth.js frontend/src/api/savedRecipes.js frontend/src/api/__tests__/auth.test.js
git commit -m "feat: add frontend auth and savedRecipes API modules"
```

---

## Task 11: AuthContext

**Files:**
- Create: `frontend/src/context/AuthContext.jsx`
- Test: `frontend/src/context/__tests__/AuthContext.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/context/__tests__/AuthContext.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../api/client.js', () => ({
  getToken: vi.fn().mockResolvedValue(null),
  setToken: vi.fn().mockResolvedValue(undefined),
  clearToken: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../api/auth.js', () => ({
  login: vi.fn(),
  signup: vi.fn(),
}))

import * as client from '../../api/client.js'
import * as authApi from '../../api/auth.js'
import { AuthProvider, useAuth } from '../AuthContext.jsx'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

beforeEach(() => {
  vi.clearAllMocks()
  client.getToken.mockResolvedValue(null)
})

describe('AuthContext', () => {
  it('starts unauthenticated when no token stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('login stores token and sets user', async () => {
    authApi.login.mockResolvedValue({ token: 'tok', user: { id: 1, email: 'a@b.com' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.login('a@b.com', 'pw') })
    expect(client.setToken).toHaveBeenCalledWith('tok')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({ id: 1, email: 'a@b.com' })
  })

  it('logout clears token and user', async () => {
    authApi.login.mockResolvedValue({ token: 'tok', user: { id: 1, email: 'a@b.com' } })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.login('a@b.com', 'pw') })
    await act(async () => { await result.current.logout() })
    expect(client.clearToken).toHaveBeenCalled()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/context/__tests__/AuthContext.test.jsx
```
Expected: FAIL — `Cannot find module '../AuthContext.jsx'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/context/AuthContext.jsx`:
```jsx
import { createContext, useContext, useState, useEffect } from 'react'
import { getToken, setToken, clearToken } from '../api/client.js'
import * as authApi from '../api/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(null)
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getToken().then((t) => {
      setTokenState(t)
      setLoading(false)
    })
  }, [])

  const login = async (email, password) => {
    const { token, user } = await authApi.login(email, password)
    await setToken(token)
    setTokenState(token)
    setUser(user)
  }

  const signup = async (email, password) => {
    const { token, user } = await authApi.signup(email, password)
    await setToken(token)
    setTokenState(token)
    setUser(user)
  }

  const logout = async () => {
    await clearToken()
    setTokenState(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, user, loading, isAuthenticated: !!token, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/context/__tests__/AuthContext.test.jsx
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AuthContext.jsx frontend/src/context/__tests__/AuthContext.test.jsx
git commit -m "feat: add AuthContext with token-in-Preferences sessions"
```

---

## Task 12: useSavedRecipes hook

**Files:**
- Create: `frontend/src/hooks/useSavedRecipes.js`
- Test: `frontend/src/hooks/__tests__/useSavedRecipes.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/__tests__/useSavedRecipes.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../api/savedRecipes.js', () => ({
  listSavedRecipes: vi.fn(),
  createSavedRecipe: vi.fn(),
  deleteSavedRecipe: vi.fn(),
}))
import * as api from '../../api/savedRecipes.js'
import { useSavedRecipes } from '../useSavedRecipes.js'

const saved = { id: 1, title: 'Soup', sourceUrl: null, ingredients: [], instructions: [] }

beforeEach(() => {
  vi.clearAllMocks()
  api.listSavedRecipes.mockResolvedValue({ recipes: [] })
})

describe('useSavedRecipes', () => {
  it('loads the list on mount', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
  })

  it('add posts and appends the saved recipe', async () => {
    api.createSavedRecipe.mockResolvedValue({ recipe: saved })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toEqual([]))
    await act(async () => { await result.current.add({ title: 'Soup' }) })
    expect(api.createSavedRecipe).toHaveBeenCalledWith({ title: 'Soup' })
    expect(result.current.list).toHaveLength(1)
  })

  it('remove deletes by id and drops it from the list', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    api.deleteSavedRecipe.mockResolvedValue(null)
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    await act(async () => { await result.current.remove(1) })
    expect(api.deleteSavedRecipe).toHaveBeenCalledWith(1)
    expect(result.current.list).toHaveLength(0)
  })

  it('findSaved matches by title and isSaved reflects it', async () => {
    api.listSavedRecipes.mockResolvedValue({ recipes: [saved] })
    const { result } = renderHook(() => useSavedRecipes())
    await waitFor(() => expect(result.current.list).toHaveLength(1))
    expect(result.current.isSaved({ title: 'Soup' })).toBe(true)
    expect(result.current.isSaved({ title: 'Other' })).toBe(false)
    expect(result.current.findSaved({ title: 'Soup' }).id).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/hooks/__tests__/useSavedRecipes.test.js
```
Expected: FAIL — `Cannot find module '../useSavedRecipes.js'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/hooks/useSavedRecipes.js`:
```js
import { useState, useEffect, useCallback } from 'react'
import { listSavedRecipes, createSavedRecipe, deleteSavedRecipe } from '../api/savedRecipes.js'

export function useSavedRecipes() {
  const [list, setList] = useState([])

  const refresh = useCallback(async () => {
    const { recipes } = await listSavedRecipes()
    setList(recipes)
  }, [])

  useEffect(() => { refresh().catch(() => {}) }, [refresh])

  const add = useCallback(async (recipe) => {
    const { recipe: saved } = await createSavedRecipe(recipe)
    setList((prev) => [...prev, saved])
    return saved
  }, [])

  const remove = useCallback(async (id) => {
    await deleteSavedRecipe(id)
    setList((prev) => prev.filter((r) => r.id !== id))
  }, [])

  // Saved recipes use DB ids; a freshly scraped recipe has none, so match by
  // sourceUrl when present, otherwise by title.
  const findSaved = useCallback(
    (recipe) =>
      list.find((r) =>
        recipe.sourceUrl && r.sourceUrl ? r.sourceUrl === recipe.sourceUrl : r.title === recipe.title
      ),
    [list]
  )

  const isSaved = useCallback((recipe) => !!findSaved(recipe), [findSaved])

  return { list, add, remove, isSaved, findSaved, refresh }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/__tests__/useSavedRecipes.test.js
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useSavedRecipes.js frontend/src/hooks/__tests__/useSavedRecipes.test.js
git commit -m "feat: add DB-backed useSavedRecipes hook"
```

---

## Task 13: Login & Signup pages

**Files:**
- Create: `frontend/src/pages/LoginPage.jsx`, `frontend/src/pages/SignupPage.jsx`, `frontend/src/pages/AuthPage.css`
- Test: `frontend/src/pages/__tests__/LoginPage.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/pages/__tests__/LoginPage.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const login = vi.fn()
const navigate = vi.fn()
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ login }) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  Link: ({ children }) => <a>{children}</a>,
}))
import { LoginPage } from '../LoginPage.jsx'

beforeEach(() => vi.clearAllMocks())

describe('LoginPage', () => {
  it('submits email and password and navigates on success', async () => {
    login.mockResolvedValue(undefined)
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'pw123456' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.com', 'pw123456'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/scrape'))
  })

  it('shows an error message when login fails', async () => {
    login.mockRejectedValue(new Error('Incorrect email or password'))
    render(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(screen.getByText('Incorrect email or password')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

From `frontend/`:
```bash
npx vitest run src/pages/__tests__/LoginPage.test.jsx
```
Expected: FAIL — `Cannot find module '../LoginPage.jsx'`.

- [ ] **Step 3: Write the pages and styles**

Create `frontend/src/pages/LoginPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './AuthPage.css'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/scrape')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1 className="auth-title">Log in</h1>
        <label className="auth-label" htmlFor="email">Email</label>
        <input id="email" className="auth-input" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label className="auth-label" htmlFor="password">Password</label>
        <input id="password" className="auth-input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="auth-switch">No account? <Link to="/signup">Sign up</Link></p>
      </form>
    </div>
  )
}
```

Create `frontend/src/pages/SignupPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import './AuthPage.css'

export function SignupPage() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signup(email, password)
      navigate('/scrape')
    } catch (err) {
      setError(err.message || 'Signup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1 className="auth-title">Sign up</h1>
        <label className="auth-label" htmlFor="email">Email</label>
        <input id="email" className="auth-input" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label className="auth-label" htmlFor="password">Password</label>
        <input id="password" className="auth-input" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="auth-switch">Have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  )
}
```

Create `frontend/src/pages/AuthPage.css`:
```css
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg, #f8fafc);
}

.auth-form {
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface, #fff);
  padding: 28px 24px;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08);
}

.auth-title {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary, #0f172a);
}

.auth-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #475569);
  margin-top: 8px;
}

.auth-input {
  padding: 12px 14px;
  font-size: 16px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  color: var(--text-primary, #0f172a);
}

.auth-input:focus {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}

.auth-error {
  color: #dc2626;
  font-size: 13px;
  margin: 4px 0 0;
}

.auth-submit {
  margin-top: 16px;
  padding: 13px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: #6366f1;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 200ms;
}

.auth-submit:hover:not(:disabled) { background: #4f46e5; }
.auth-submit:disabled { opacity: 0.6; cursor: default; }

.auth-switch {
  margin-top: 16px;
  font-size: 14px;
  text-align: center;
  color: var(--text-secondary, #475569);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/pages/__tests__/LoginPage.test.jsx
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.jsx frontend/src/pages/SignupPage.jsx frontend/src/pages/AuthPage.css frontend/src/pages/__tests__/LoginPage.test.jsx
git commit -m "feat: add login and signup pages"
```

---

## Task 14: Route guard + wire AuthProvider into App

**Files:**
- Create: `frontend/src/components/RequireAuth.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Write the guard**

Create `frontend/src/components/RequireAuth.jsx`:
```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 2: Update App.jsx**

Replace the entire contents of `frontend/src/App.jsx`:
```jsx
import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { RecipeProvider } from './context/RecipeContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { RequireAuth } from './components/RequireAuth.jsx'
import { TabBar } from './components/TabBar.jsx'
import { ScrapePage } from './pages/ScrapePage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { SavedPage } from './pages/SavedPage.jsx'
import { RecipeDetailPage } from './pages/RecipeDetailPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { SignupPage } from './pages/SignupPage.jsx'
import './styles/global.css'
import './App.css'

function TabLayout() {
  return (
    <div className="tab-layout">
      <div className="tab-content">
        <Outlet />
      </div>
      <TabBar />
    </div>
  )
}

const router = createHashRouter([
  { path: '/', element: <Navigate to="/scrape" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  {
    element: <RequireAuth><TabLayout /></RequireAuth>,
    children: [
      { path: '/scrape', element: <ScrapePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/saved',  element: <SavedPage /> },
    ],
  },
  { path: '/recipe', element: <RequireAuth><RecipeDetailPage /></RequireAuth> },
])

export default function App() {
  return (
    <AuthProvider>
      <RecipeProvider>
        <RouterProvider router={router} />
      </RecipeProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 3: Verify the full frontend suite still passes**

From `frontend/`:
```bash
npm run test:run
```
Expected: all tests pass (no test imports the real router tree; guards are unit-tested via AuthContext).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RequireAuth.jsx frontend/src/App.jsx
git commit -m "feat: guard routes behind auth and add login/signup routes"
```

---

## Task 15: Swap SavedPage / RecipeDetailPage / TabBar to the new hook

**Files:**
- Modify: `frontend/src/pages/SavedPage.jsx`, `frontend/src/pages/RecipeDetailPage.jsx`, `frontend/src/components/TabBar.jsx`

- [ ] **Step 1: Update SavedPage to use useSavedRecipes**

In `frontend/src/pages/SavedPage.jsx`, change the import and usage. Replace:
```js
import { useFavorites } from '../hooks/useFavorites.js'
```
with:
```js
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
```
And replace:
```js
  const { favorites } = useFavorites()
```
with:
```js
  const { list: favorites } = useSavedRecipes()
```
(The rest of the component — which maps `favorites` to `SearchResultItem` — is unchanged.)

- [ ] **Step 2: Update RecipeDetailPage to use useSavedRecipes**

In `frontend/src/pages/RecipeDetailPage.jsx`, replace:
```js
import { useFavorites } from '../hooks/useFavorites.js'
```
with:
```js
import { useSavedRecipes } from '../hooks/useSavedRecipes.js'
```
Replace:
```js
  const { isFavorite, addFavorite, removeFavorite } = useFavorites()
```
with:
```js
  const { add, remove, findSaved } = useSavedRecipes()
```
Replace:
```js
  const fav = isFavorite(recipe.id)

  const handleToggleFav = () => {
    fav ? removeFavorite(recipe.id) : addFavorite(recipe)
  }
```
with:
```js
  const savedRow = findSaved(recipe)
  const fav = !!savedRow

  const handleToggleFav = () => {
    if (savedRow) {
      remove(savedRow.id)
    } else {
      add(recipe)
    }
  }
```
(`fav` / `handleToggleFav` are still passed to `ImageCard` exactly as before.)

- [ ] **Step 3: Add a logout button to the TabBar**

In `frontend/src/components/TabBar.jsx`, add the auth import at the top (after the `NavLink` import):
```js
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
```
Add a logout icon component alongside the other icon components:
```js
function LogoutIcon() {
  return (
    <svg className="tab-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.8" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
    </svg>
  )
}
```
Replace the `TabBar` function body so it renders a logout button after the tab links:
```jsx
export function TabBar() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <nav className="tab-bar" aria-label="Main navigation">
      <div className="tab-bar__brand" aria-hidden="true">
        <span className="tab-bar__brand-name">Recipe</span>
        <span className="tab-bar__brand-sub">Scraper</span>
      </div>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `tab-item${isActive ? ' tab-item--active' : ''}`
          }
        >
          <Icon />
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
      <button type="button" className="tab-item" onClick={handleLogout} aria-label="Log out">
        <LogoutIcon />
        <span className="tab-label">Logout</span>
      </button>
    </nav>
  )
}
```

- [ ] **Step 4: Verify the frontend suite**

From `frontend/`:
```bash
npm run test:run
```
Expected: all tests pass. (The old `useFavorites.test.js` still passes — that hook file remains in the repo, just unused; leave it to keep this task focused.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SavedPage.jsx frontend/src/pages/RecipeDetailPage.jsx frontend/src/components/TabBar.jsx
git commit -m "feat: back Saved page and favorites with the account API; add logout"
```

---

## Task 16: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Backend suite**

From `backend/`:
```bash
npm test
```
Expected: all tests pass (nutrition + auth + saved-recipe handlers).

- [ ] **Step 2: Frontend suite**

From `frontend/`:
```bash
npm run test:run
```
Expected: all tests pass.

- [ ] **Step 3: End-to-end auth + save flow**

- Backend: `node server.js` (DB reachable). Confirm it boots.
- Frontend: from `frontend/`, set `VITE_API_URL=http://localhost:7000`, run `npm run dev`.
- In the app: you should be redirected to `/login`. Click "Sign up", create an account → land on the Scrape tab.
- Scrape a recipe, open it, tap the heart → it saves. Go to the Saved tab → the recipe is listed.
- Tap the heart again (or use the saved item) → unsaving removes it from the Saved tab.
- Tap Logout → redirected to `/login`. Log back in → your saved recipes are still there (persisted in MSSQL).

- [ ] **Step 4: Cross-user isolation check**

- Sign up a second account. Confirm its Saved tab is empty (does not show the first user's recipes).

- [ ] **Step 5: Final review**

Use superpowers:requesting-code-review to verify the work meets the spec, then superpowers:finishing-a-development-branch to integrate.

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1); bcryptjs + JWT_SECRET (Task 2); hashing (Task 3); JWT (Task 4); middleware (Task 5); signup/login (Task 6); saved-recipe CRUD scoped to user (Task 7); server wiring (Task 8); apiClient token/401/methods (Task 9); auth + savedRecipes API (Task 10); AuthContext (Task 11); useSavedRecipes (Task 12); login/signup pages (Task 13); guard + routing (Task 14); SavedPage/RecipeDetailPage/TabBar swap + logout (Task 15); verification incl. cross-user isolation (Task 16). All spec sections map to a task.
- **Type consistency:** handler factories are `makeXHandler(prisma)` returning `(req,res)=>` across Tasks 5–7 and consumed by routers in Tasks 6–8. `serializeRecipe(recipe,userId)` / `deserializeRecipe(row)` defined in Task 7 are used by the same file's handlers. Frontend `apiClient(path, body)` / `apiGet(path)` / `apiDelete(path)` defined in Task 9 are consumed identically in Task 10. `useAuth()` exposes `{ token, user, loading, isAuthenticated, login, signup, logout }` (Task 11), used in Tasks 13–15. `useSavedRecipes()` exposes `{ list, add, remove, isSaved, findSaved, refresh }` (Task 12), used in Task 15.
- **Deviation from spec:** DELETE returns `200 { deleted: true }` rather than `204` (keeps the handler trivially unit-testable with a mock res); the frontend `apiDelete` tolerates both.
- **Placeholder scan:** every code step contains complete code; DB- and server-dependent steps (db push, curl smoke tests, e2e) are explicit because they need the user's MSSQL instance.
- **Out of scope (per spec):** global catalog CSV untouched; no auto-migration of device-local favorites (the old `useFavorites.js` + its test remain in the repo, unused, to keep the swap focused).
