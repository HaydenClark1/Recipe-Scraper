# Recipe Scraper Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first React (.jsx) + Vite web app in `frontend/` that consumes the existing backend at `https://recipe-scraper-hk6l.onrender.com`, packaged as an Android app via Capacitor for the Samsung Galaxy Store.

**Architecture:** Hash-based router with a TabLayout (Scrape / Search / Saved) and a separate full-screen RecipeDetailPage (no tab bar). Shared recipe state flows through RecipeContext. Swipeable 4-card detail (Image → Ingredients → Instructions → Nutrition) via embla-carousel. Favorites stored on-device via Capacitor Preferences.

**Tech Stack:** React 19, Vite 6, react-router-dom 7 (hash router), embla-carousel-react 8, @capacitor/core + android + preferences, Vitest 2, React Testing Library 16

---

## File Map

```
frontend/
  index.html
  vite.config.js
  capacitor.config.json
  package.json
  .env.example
  src/
    main.jsx
    App.jsx
    App.css
    test/
      setup.js
    api/
      client.js
      recipes.js
      __tests__/
        client.test.js
        recipes.test.js
    hooks/
      useFavorites.js
      __tests__/
        useFavorites.test.js
    lib/
      normalize.js
      __tests__/
        normalize.test.js
    context/
      RecipeContext.jsx
    pages/
      ScrapePage.jsx        ScrapePage.css
      SearchPage.jsx        SearchPage.css
      SavedPage.jsx         SavedPage.css
      RecipeDetailPage.jsx  RecipeDetailPage.css
    components/
      TabBar.jsx            TabBar.css
      RecipeCarousel.jsx    RecipeCarousel.css
      PaginationDots.jsx    PaginationDots.css
      cards/
        ImageCard.jsx         ImageCard.css
        IngredientsCard.jsx   IngredientsCard.css
        InstructionsCard.jsx  InstructionsCard.css
        NutritionCard.jsx     NutritionCard.css
        __tests__/
          ImageCard.test.jsx
          InstructionsCard.test.jsx
          NutritionCard.test.jsx
      ui/
        Spinner.jsx         Spinner.css
        ErrorMessage.jsx    ErrorMessage.css
        SearchResultItem.jsx SearchResultItem.css
    styles/
      tokens.css
      global.css
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `frontend/` (entire directory via Vite)
- Create: `frontend/package.json` (add extra deps)
- Create: `frontend/capacitor.config.json`
- Create: `frontend/.env.example`

- [ ] **Step 1: Scaffold Vite + React project**

Run from the repo root:
```bash
npm create vite@latest frontend -- --template react
cd frontend
```

Expected: `frontend/` is created with `src/App.jsx`, `src/main.jsx`, `index.html`, `vite.config.js`, `package.json`.

- [ ] **Step 2: Install all dependencies**

```bash
npm install react-router-dom embla-carousel-react @capacitor/core @capacitor/preferences
npm install -D @capacitor/cli @capacitor/android vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

Expected: `node_modules/` populated, no peer-dep errors.

- [ ] **Step 3: Delete Vite boilerplate**

Delete these files (they'll be replaced):
```bash
rm src/App.jsx src/App.css src/index.css src/assets/react.svg
```

- [ ] **Step 4: Add scripts to package.json**

Open `frontend/package.json`. Replace the `"scripts"` section with:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest",
  "test:run": "vitest run",
  "coverage": "vitest run --coverage"
},
```

- [ ] **Step 5: Create capacitor.config.json**

Create `frontend/capacitor.config.json`:
```json
{
  "appId": "com.haydenclark.recipescraper",
  "appName": "Recipe Scraper",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

- [ ] **Step 6: Create .env.example**

Create `frontend/.env.example`:
```
VITE_API_URL=https://recipe-scraper-hk6l.onrender.com
# For local dev: VITE_API_URL=http://localhost:7000
```

- [ ] **Step 7: Create .env.local for dev**

Create `frontend/.env.local` (gitignored by Vite by default):
```
VITE_API_URL=https://recipe-scraper-hk6l.onrender.com
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite prints `Local: http://localhost:5173/`, browser opens (or visit manually). Should show blank white page (boilerplate deleted).

- [ ] **Step 9: Commit**

```bash
cd ..
git add frontend/
git commit -m "feat: scaffold vite+react frontend with capacitor config"
```

---

## Task 2: Test Infrastructure

**Files:**
- Create: `frontend/src/test/setup.js`
- Modify: `frontend/vite.config.js`

- [ ] **Step 1: Update vite.config.js to add test config**

Replace `frontend/vite.config.js` with:
```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
  },
})
```

- [ ] **Step 2: Create test setup file**

Create `frontend/src/test/setup.js`:
```js
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Verify test runner works**

```bash
cd frontend
npm run test:run
```

Expected: `No test files found` (exit 0) — no tests yet, but the runner starts without errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/vite.config.js frontend/src/test/setup.js
git commit -m "feat: configure vitest with jsdom and testing-library"
```

---

## Task 3: Data Normalization (TDD)

**Files:**
- Create: `frontend/src/lib/normalize.js`
- Create: `frontend/src/lib/__tests__/normalize.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/lib/__tests__/normalize.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { normalizeScraped, normalizeSearchResult } from '../normalize.js'

describe('normalizeScraped', () => {
  it('maps scrape response to normalized shape', () => {
    const input = {
      title: 'Banana Bread',
      image: 'https://example.com/img.jpg',
      ingredients: ['2 bananas', '1 cup flour'],
      instructions: ['Mix everything', 'Bake at 350'],
      prepTime: 'PT10M',
      totalTime: 'PT1H',
      servings: '8 servings',
      category: ['Bread'],
      cuisine: 'American',
    }
    const result = normalizeScraped(input)
    expect(result.title).toBe('Banana Bread')
    expect(result.image).toBe('https://example.com/img.jpg')
    expect(result.ingredients).toEqual(['2 bananas', '1 cup flour'])
    expect(result.instructions).toEqual(['Mix everything', 'Bake at 350'])
    expect(result.prepTime).toBe('PT10M')
    expect(result.totalTime).toBe('PT1H')
    expect(result.servings).toBe('8 servings')
    expect(result.category).toEqual(['Bread'])
    expect(result.cuisine).toEqual(['American'])
    expect(result.source).toBe('scrape')
    expect(typeof result.id).toBe('string')
    expect(result.id.length).toBeGreaterThan(0)
  })

  it('converts "N/A" strings to null', () => {
    const input = {
      title: 'Test',
      image: null,
      ingredients: [],
      instructions: [],
      prepTime: 'N/A',
      totalTime: 'N/A',
      servings: 'N/A',
      category: [],
      cuisine: [],
    }
    const result = normalizeScraped(input)
    expect(result.prepTime).toBeNull()
    expect(result.totalTime).toBeNull()
    expect(result.servings).toBeNull()
  })

  it('treats non-array instructions string as empty array', () => {
    const input = {
      title: 'Test',
      image: null,
      ingredients: [],
      instructions: 'No instructions Found',
      prepTime: null,
      totalTime: null,
      servings: null,
      category: [],
      cuisine: [],
    }
    const result = normalizeScraped(input)
    expect(result.instructions).toEqual([])
  })
})

describe('normalizeSearchResult', () => {
  it('splits comma-separated Cleaned_Ingredients into array', () => {
    const input = {
      Title: 'Pasta',
      Cleaned_Ingredients: "['1 cup pasta', '2 tbsp oil']",
      Instructions: 'Boil pasta\nDrain and serve',
      Image_Name: 'https://raw.githubusercontent.com/example/img.jpg',
    }
    const result = normalizeSearchResult(input)
    expect(result.title).toBe('Pasta')
    expect(result.ingredients).toContain('1 cup pasta')
    expect(result.ingredients).toContain('2 tbsp oil')
    expect(result.source).toBe('search')
    expect(result.image).toBe('https://raw.githubusercontent.com/example/img.jpg')
  })

  it('splits newline-separated Instructions into array', () => {
    const input = {
      Title: 'Soup',
      Cleaned_Ingredients: 'water',
      Instructions: 'Boil water\nAdd salt\nServe hot',
      Image_Name: '',
    }
    const result = normalizeSearchResult(input)
    expect(result.instructions).toEqual(['Boil water', 'Add salt', 'Serve hot'])
    expect(result.image).toBeNull()
  })

  it('falls back to numbered-step split when no newlines', () => {
    const input = {
      Title: 'Eggs',
      Cleaned_Ingredients: '',
      Instructions: '1. Crack eggs 2. Fry in pan 3. Serve',
      Image_Name: null,
    }
    const result = normalizeSearchResult(input)
    expect(result.instructions.length).toBeGreaterThan(1)
  })

  it('generates stable id from title and image', () => {
    const input = {
      Title: 'Cake',
      Cleaned_Ingredients: '',
      Instructions: '',
      Image_Name: 'img.jpg',
    }
    expect(normalizeSearchResult(input).id).toBe(normalizeSearchResult(input).id)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../normalize.js'`

- [ ] **Step 3: Implement normalize.js**

Create `frontend/src/lib/normalize.js`:
```js
function generateId(title, image) {
  const str = `${title}::${image || ''}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return String(Math.abs(hash))
}

function splitInstructions(text) {
  if (!text) return []
  const byNewline = text.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  const byNumber = text.split(/(?=\d+\.\s)/g).map(s => s.trim()).filter(Boolean)
  if (byNumber.length > 1) return byNumber
  return byNewline
}

export function normalizeScraped(data) {
  const clean = (val) => (val === 'N/A' || val == null) ? null : val
  return {
    id: generateId(data.title || '', data.image),
    title: data.title || '',
    image: data.image || null,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    instructions: Array.isArray(data.instructions) ? data.instructions : [],
    prepTime: clean(data.prepTime),
    totalTime: clean(data.totalTime),
    servings: clean(data.servings),
    category: Array.isArray(data.category)
      ? data.category
      : (data.category ? [data.category] : []),
    cuisine: Array.isArray(data.cuisine)
      ? data.cuisine
      : (data.cuisine ? [data.cuisine] : []),
    source: 'scrape',
  }
}

export function normalizeSearchResult(item) {
  const ingredients = typeof item.Cleaned_Ingredients === 'string'
    ? item.Cleaned_Ingredients
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(s => s.trim().replace(/^'+|'+$/g, ''))
        .filter(Boolean)
    : []

  const instructions = typeof item.Instructions === 'string'
    ? splitInstructions(item.Instructions)
    : []

  const image = item.Image_Name || null

  return {
    id: generateId(item.Title || '', image),
    title: item.Title || '',
    image,
    ingredients,
    instructions,
    prepTime: null,
    totalTime: null,
    servings: null,
    category: [],
    cuisine: [],
    source: 'search',
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `7 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/lib/
git commit -m "feat: add normalize.js with scrape and search result normalization"
```

---

## Task 4: API Client (TDD)

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/__tests__/client.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/api/__tests__/client.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiClient } from '../client.js'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('apiClient', () => {
  it('POSTs JSON to the correct URL and returns parsed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Pasta' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await apiClient('/scrape-recipe', { url: 'https://x.com' })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/scrape-recipe$/),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://x.com' }),
      })
    )
    expect(result).toEqual({ title: 'Pasta' })
  })

  it('throws with status and message on non-2xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: 'Recipe not found' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(apiClient('/scrape-recipe', { url: 'x' })).rejects.toMatchObject({
      message: 'Recipe not found',
      status: 404,
    })
  })

  it('throws with HTTP status string when body has no message', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('bad json')),
    })
    vi.stubGlobal('fetch', mockFetch)

    await expect(apiClient('/x', {})).rejects.toMatchObject({
      message: 'HTTP 500',
    })
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../client.js'`

- [ ] **Step 3: Implement client.js**

Create `frontend/src/api/client.js`:
```js
const BASE_URL = import.meta.env?.VITE_API_URL ?? 'https://recipe-scraper-hk6l.onrender.com'

export async function apiClient(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const err = new Error(data.message || data.error || `HTTP ${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }
  return res.json()
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/api/client.js frontend/src/api/__tests__/client.test.js
git commit -m "feat: add api client with error handling"
```

---

## Task 5: API Layer (TDD)

**Files:**
- Create: `frontend/src/api/recipes.js`
- Create: `frontend/src/api/__tests__/recipes.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/api/__tests__/recipes.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as client from '../client.js'

vi.mock('../client.js', () => ({
  apiClient: vi.fn(),
}))

beforeEach(() => vi.clearAllMocks())

describe('scrapeRecipe', () => {
  it('calls /scrape-recipe with the url', async () => {
    client.apiClient.mockResolvedValue({ title: 'Cake' })
    const { scrapeRecipe } = await import('../recipes.js')
    await scrapeRecipe('https://example.com')
    expect(client.apiClient).toHaveBeenCalledWith('/scrape-recipe', { url: 'https://example.com' })
  })
})

describe('searchRecipes', () => {
  it('calls /search-recipies with the search term', async () => {
    client.apiClient.mockResolvedValue({ recipes: [] })
    const { searchRecipes } = await import('../recipes.js')
    await searchRecipes('pasta')
    expect(client.apiClient).toHaveBeenCalledWith('/search-recipies', { search: 'pasta' })
  })
})

describe('saveRecipe', () => {
  it('calls /save-recipe with recipe object', async () => {
    client.apiClient.mockResolvedValue({ message: 'Recipe saved' })
    const { saveRecipe } = await import('../recipes.js')
    const recipe = { title: 'Soup', ingredients: [] }
    await saveRecipe(recipe)
    expect(client.apiClient).toHaveBeenCalledWith('/save-recipe', { recipe })
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../recipes.js'`

- [ ] **Step 3: Implement recipes.js**

Create `frontend/src/api/recipes.js`:
```js
import { apiClient } from './client.js'

export const scrapeRecipe = (url) =>
  apiClient('/scrape-recipe', { url })

export const searchRecipes = (search) =>
  apiClient('/search-recipies', { search })

export const getNutrition = (ingredients) =>
  apiClient('/get-nutrition', { ingredients })

export const parseIngredients = (ingredients) =>
  apiClient('/parse-ingredients-api', { ingredients })

export const saveRecipe = (recipe) =>
  apiClient('/save-recipe', { recipe })
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/api/recipes.js frontend/src/api/__tests__/recipes.test.js
git commit -m "feat: add typed API functions for all 5 backend endpoints"
```

---

## Task 6: Favorites Hook (TDD)

**Files:**
- Create: `frontend/src/hooks/useFavorites.js`
- Create: `frontend/src/hooks/__tests__/useFavorites.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/hooks/__tests__/useFavorites.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useFavorites } from '../useFavorites.js'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn().mockResolvedValue({ value: null }),
    set: vi.fn().mockResolvedValue(undefined),
  },
}))

import { Preferences } from '@capacitor/preferences'

beforeEach(() => {
  vi.clearAllMocks()
  Preferences.get.mockResolvedValue({ value: null })
  Preferences.set.mockResolvedValue(undefined)
})

const recipe = { id: '123', title: 'Soup', image: null, source: 'scrape', ingredients: [], instructions: [], prepTime: null, totalTime: null, servings: null, category: [], cuisine: [] }

describe('useFavorites', () => {
  it('initializes with empty favorites', async () => {
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toEqual([]))
  })

  it('loads existing favorites from Preferences on mount', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
  })

  it('addFavorite adds a recipe and persists it', async () => {
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toEqual([]))
    await act(async () => { await result.current.addFavorite(recipe) })
    expect(result.current.favorites).toHaveLength(1)
    expect(result.current.favorites[0].source).toBe('favorite')
    expect(Preferences.set).toHaveBeenCalled()
  })

  it('removeFavorite removes by id and persists', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    await act(async () => { await result.current.removeFavorite('123') })
    expect(result.current.favorites).toHaveLength(0)
    expect(Preferences.set).toHaveBeenCalled()
  })

  it('isFavorite returns true for saved id, false otherwise', async () => {
    Preferences.get.mockResolvedValue({ value: JSON.stringify([recipe]) })
    const { result } = renderHook(() => useFavorites())
    await waitFor(() => expect(result.current.favorites).toHaveLength(1))
    expect(result.current.isFavorite('123')).toBe(true)
    expect(result.current.isFavorite('999')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../useFavorites.js'`

- [ ] **Step 3: Implement useFavorites.js**

Create `frontend/src/hooks/useFavorites.js`:
```js
import { useState, useEffect, useCallback } from 'react'
import { Preferences } from '@capacitor/preferences'

const KEY = 'recipe-favorites'

async function loadFavorites() {
  const { value } = await Preferences.get({ key: KEY })
  return value ? JSON.parse(value) : []
}

async function persistFavorites(list) {
  await Preferences.set({ key: KEY, value: JSON.stringify(list) })
}

export function useFavorites() {
  const [favorites, setFavorites] = useState([])

  useEffect(() => {
    loadFavorites().then(setFavorites)
  }, [])

  const addFavorite = useCallback(async (recipe) => {
    const updated = [
      ...favorites.filter(f => f.id !== recipe.id),
      { ...recipe, source: 'favorite' },
    ]
    setFavorites(updated)
    await persistFavorites(updated)
  }, [favorites])

  const removeFavorite = useCallback(async (id) => {
    const updated = favorites.filter(f => f.id !== id)
    setFavorites(updated)
    await persistFavorites(updated)
  }, [favorites])

  const isFavorite = useCallback((id) =>
    favorites.some(f => f.id === id), [favorites])

  return { favorites, addFavorite, removeFavorite, isFavorite }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/hooks/
git commit -m "feat: add useFavorites hook with Capacitor Preferences storage"
```

---

## Task 7: Design Tokens + Global CSS

**Files:**
- Create: `frontend/src/styles/tokens.css`
- Create: `frontend/src/styles/global.css`
- Create: `frontend/src/App.css`

- [ ] **Step 1: Create tokens.css**

Create `frontend/src/styles/tokens.css`:
```css
:root {
  --accent: #2d6a4f;
  --accent-light: #d8f3dc;
  --accent-dark: #1b4332;
  --bg: #f8f9fa;
  --surface: #ffffff;
  --text-primary: #1a1a1a;
  --text-secondary: #6c757d;
  --border: #dee2e6;
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);
  --tab-height: 64px;
  --header-height: 56px;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 2: Create global.css**

Create `frontend/src/styles/global.css`:
```css
@import './tokens.css';

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

#root {
  display: flex;
  flex-direction: column;
  max-width: 480px;
  margin: 0 auto;
  height: 100%;
  height: 100dvh;
}

button {
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
  font-size: inherit;
}

input {
  font-family: inherit;
  font-size: inherit;
}

/* Shared across pages */
.page-header {
  padding: 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}

/* Shared across cards */
.card-heading {
  font-size: 18px;
  font-weight: 600;
  padding: 16px 16px 8px;
  color: var(--text-primary);
}

.card-empty {
  padding: 16px;
  color: var(--text-secondary);
  font-size: 14px;
}

mark.highlight {
  background: var(--accent-light);
  color: var(--accent-dark);
  border-radius: 3px;
  padding: 0 2px;
}
```

- [ ] **Step 3: Create App.css**

Create `frontend/src/App.css`:
```css
.tab-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  height: 100dvh;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/styles/ frontend/src/App.css
git commit -m "feat: add design tokens and global CSS"
```

---

## Task 8: RecipeContext

**Files:**
- Create: `frontend/src/context/RecipeContext.jsx`

- [ ] **Step 1: Create RecipeContext.jsx**

Create `frontend/src/context/RecipeContext.jsx`:
```jsx
import { createContext, useContext, useState } from 'react'

const RecipeContext = createContext(null)

export function RecipeProvider({ children }) {
  const [recipe, setRecipe] = useState(null)
  return (
    <RecipeContext.Provider value={{ recipe, setRecipe }}>
      {children}
    </RecipeContext.Provider>
  )
}

export function useRecipe() {
  return useContext(RecipeContext)
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/context/RecipeContext.jsx
git commit -m "feat: add RecipeContext for shared recipe state"
```

---

## Task 9: UI Primitives — Spinner, ErrorMessage, SearchResultItem

**Files:**
- Create: `frontend/src/components/ui/Spinner.jsx` + `Spinner.css`
- Create: `frontend/src/components/ui/ErrorMessage.jsx` + `ErrorMessage.css`
- Create: `frontend/src/components/ui/SearchResultItem.jsx` + `SearchResultItem.css`

- [ ] **Step 1: Create Spinner**

Create `frontend/src/components/ui/Spinner.jsx`:
```jsx
import './Spinner.css'

export function Spinner({ message }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" role="status" aria-label="Loading" />
      {message && <p className="spinner-msg">{message}</p>}
    </div>
  )
}
```

Create `frontend/src/components/ui/Spinner.css`:
```css
.spinner-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--accent-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.spinner-msg {
  font-size: 14px;
  color: var(--text-secondary);
  text-align: center;
}
```

- [ ] **Step 2: Create ErrorMessage**

Create `frontend/src/components/ui/ErrorMessage.jsx`:
```jsx
import './ErrorMessage.css'

export function ErrorMessage({ message, onRetry }) {
  return (
    <div className="error-wrap" role="alert">
      <p className="error-text">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="error-retry" onClick={onRetry}>Try again</button>
      )}
    </div>
  )
}
```

Create `frontend/src/components/ui/ErrorMessage.css`:
```css
.error-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: #fff3f3;
  border-radius: var(--radius-md);
  margin: 16px;
}

.error-text {
  color: #c0392b;
  font-size: 14px;
  text-align: center;
}

.error-retry {
  padding: 8px 20px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
}
```

- [ ] **Step 3: Create SearchResultItem**

Create `frontend/src/components/ui/SearchResultItem.jsx`:
```jsx
import './SearchResultItem.css'

export function SearchResultItem({ recipe, onClick }) {
  return (
    <button className="search-result-item" onClick={onClick}>
      {recipe.image ? (
        <img
          className="search-result-thumb"
          src={recipe.image}
          alt={recipe.title}
          loading="lazy"
        />
      ) : (
        <div className="search-result-thumb search-result-thumb--empty" aria-hidden="true" />
      )}
      <span className="search-result-title">{recipe.title}</span>
    </button>
  )
}
```

Create `frontend/src/components/ui/SearchResultItem.css`:
```css
.search-result-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  text-align: left;
  transition: background 0.1s;
}

.search-result-item:active {
  background: var(--bg);
}

.search-result-thumb {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg);
}

.search-result-thumb--empty {
  background: var(--border);
}

.search-result-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

- [ ] **Step 4: Commit**

```bash
cd ..
git add frontend/src/components/ui/
git commit -m "feat: add Spinner, ErrorMessage, SearchResultItem UI primitives"
```

---

## Task 10: PaginationDots + RecipeCarousel

**Files:**
- Create: `frontend/src/components/PaginationDots.jsx` + `PaginationDots.css`
- Create: `frontend/src/components/RecipeCarousel.jsx` + `RecipeCarousel.css`

- [ ] **Step 1: Create PaginationDots**

Create `frontend/src/components/PaginationDots.jsx`:
```jsx
import './PaginationDots.css'

export function PaginationDots({ total, current }) {
  return (
    <div className="pagination-dots" role="tablist" aria-label="Recipe sections">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`dot ${i === current ? 'dot--active' : ''}`}
          role="tab"
          aria-selected={i === current}
        />
      ))}
    </div>
  )
}
```

Create `frontend/src/components/PaginationDots.css`:
```css
.pagination-dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 0;
  background: var(--surface);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  transition: background 0.2s, transform 0.2s;
}

.dot--active {
  background: var(--accent);
  transform: scale(1.3);
}
```

- [ ] **Step 2: Create RecipeCarousel**

Create `frontend/src/components/RecipeCarousel.jsx`:
```jsx
import useEmblaCarousel from 'embla-carousel-react'
import { useState, useEffect } from 'react'
import { PaginationDots } from './PaginationDots.jsx'
import './RecipeCarousel.css'

export function RecipeCarousel({ slides }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false })
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setCurrent(emblaApi.selectedScrollSnap())
    emblaApi.on('select', onSelect)
    return () => emblaApi.off('select', onSelect)
  }, [emblaApi])

  return (
    <div className="carousel-wrap">
      <div className="carousel-viewport" ref={emblaRef}>
        <div className="carousel-container">
          {slides.map((slide, i) => (
            <div className="carousel-slide" key={i}>
              {slide}
            </div>
          ))}
        </div>
      </div>
      <PaginationDots total={slides.length} current={current} />
    </div>
  )
}
```

Create `frontend/src/components/RecipeCarousel.css`:
```css
.carousel-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.carousel-viewport {
  flex: 1;
  overflow: hidden;
}

.carousel-container {
  display: flex;
  height: 100%;
}

.carousel-slide {
  flex: 0 0 100%;
  min-width: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

- [ ] **Step 3: Commit**

```bash
cd ..
git add frontend/src/components/PaginationDots.jsx frontend/src/components/PaginationDots.css frontend/src/components/RecipeCarousel.jsx frontend/src/components/RecipeCarousel.css
git commit -m "feat: add PaginationDots and RecipeCarousel with embla"
```

---

## Task 11: ImageCard

**Files:**
- Create: `frontend/src/components/cards/ImageCard.jsx` + `ImageCard.css`
- Create: `frontend/src/components/cards/__tests__/ImageCard.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/cards/__tests__/ImageCard.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageCard } from '../ImageCard.jsx'

const base = {
  title: 'Banana Bread',
  image: 'https://example.com/img.jpg',
  ingredients: [],
  instructions: [],
  prepTime: 'PT15M',
  totalTime: 'PT1H',
  servings: '8',
  category: ['Bread'],
  cuisine: ['American'],
  source: 'scrape',
}

it('renders title and image', () => {
  render(<ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />)
  expect(screen.getByText('Banana Bread')).toBeInTheDocument()
  expect(screen.getByRole('img')).toHaveAttribute('src', 'https://example.com/img.jpg')
})

it('shows "Add to database" button only for source=scrape', () => {
  const { rerender } = render(
    <ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />
  )
  expect(screen.getByText('Add to database')).toBeInTheDocument()

  rerender(
    <ImageCard recipe={{ ...base, source: 'search' }} isFav={false} onToggleFav={() => {}} saveDbState="idle" onSaveToDb={() => {}} />
  )
  expect(screen.queryByText('Add to database')).not.toBeInTheDocument()
})

it('shows "Already in database" for duplicate saveDbState', () => {
  render(<ImageCard recipe={base} isFav={false} onToggleFav={() => {}} saveDbState="duplicate" onSaveToDb={() => {}} />)
  expect(screen.getByText('Already in database')).toBeInTheDocument()
})

it('calls onToggleFav when heart button is clicked', async () => {
  const user = userEvent.setup()
  const onToggleFav = vi.fn()
  render(<ImageCard recipe={base} isFav={false} onToggleFav={onToggleFav} saveDbState="idle" onSaveToDb={() => {}} />)
  await user.click(screen.getByLabelText('Add to favorites'))
  expect(onToggleFav).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../ImageCard.jsx'`

- [ ] **Step 3: Implement ImageCard.jsx**

Create `frontend/src/components/cards/ImageCard.jsx`:
```jsx
import './ImageCard.css'

const DB_BUTTON_LABELS = {
  idle: 'Add to database',
  loading: 'Saving…',
  saved: 'Added!',
  duplicate: 'Already in database',
  error: 'Save failed – retry',
}

export function ImageCard({ recipe, isFav, onToggleFav, saveDbState, onSaveToDb }) {
  return (
    <div className="image-card">
      {recipe.image ? (
        <img className="image-card__img" src={recipe.image} alt={recipe.title} />
      ) : (
        <div className="image-card__placeholder">No image available</div>
      )}
      <div className="image-card__content">
        <div className="image-card__header">
          <h1 className="image-card__title">{recipe.title}</h1>
          <button
            className={`image-card__fav ${isFav ? 'image-card__fav--active' : ''}`}
            onClick={onToggleFav}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            {isFav ? '♥' : '♡'}
          </button>
        </div>
        <dl className="image-card__meta">
          {recipe.prepTime && <><dt>Prep</dt><dd>{recipe.prepTime}</dd></>}
          {recipe.totalTime && <><dt>Total</dt><dd>{recipe.totalTime}</dd></>}
          {recipe.servings && <><dt>Serves</dt><dd>{recipe.servings}</dd></>}
          {recipe.category?.length > 0 && (
            <><dt>Category</dt><dd>{[].concat(recipe.category).join(', ')}</dd></>
          )}
          {recipe.cuisine?.length > 0 && (
            <><dt>Cuisine</dt><dd>{[].concat(recipe.cuisine).join(', ')}</dd></>
          )}
        </dl>
        {recipe.source === 'scrape' && (
          <button
            className={`image-card__save-btn image-card__save-btn--${saveDbState}`}
            onClick={saveDbState === 'error' ? onSaveToDb : onSaveToDb}
            disabled={saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate'}
          >
            {DB_BUTTON_LABELS[saveDbState] ?? 'Add to database'}
          </button>
        )}
      </div>
    </div>
  )
}
```

Create `frontend/src/components/cards/ImageCard.css`:
```css
.image-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

.image-card__img {
  width: 100%;
  height: 220px;
  object-fit: cover;
}

.image-card__placeholder {
  width: 100%;
  height: 220px;
  background: var(--bg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.image-card__content {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

.image-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.image-card__title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-primary);
  flex: 1;
}

.image-card__fav {
  font-size: 28px;
  color: var(--border);
  flex-shrink: 0;
  line-height: 1;
  transition: color 0.2s, transform 0.15s;
}

.image-card__fav--active {
  color: #e74c3c;
}

.image-card__fav:active {
  transform: scale(1.3);
}

.image-card__meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  font-size: 14px;
  margin-bottom: 16px;
}

.image-card__meta dt {
  color: var(--text-secondary);
  font-weight: 500;
}

.image-card__meta dd {
  color: var(--text-primary);
}

.image-card__save-btn {
  width: 100%;
  padding: 12px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.image-card__save-btn:disabled {
  opacity: 0.6;
}

.image-card__save-btn--saved { background: #27ae60; }
.image-card__save-btn--duplicate { background: var(--text-secondary); }
.image-card__save-btn--error { background: #c0392b; }
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/components/cards/ImageCard.jsx frontend/src/components/cards/ImageCard.css frontend/src/components/cards/__tests__/ImageCard.test.jsx
git commit -m "feat: add ImageCard with favorite toggle and conditional add-to-db button"
```

---

## Task 12: IngredientsCard

**Files:**
- Create: `frontend/src/components/cards/IngredientsCard.jsx` + `IngredientsCard.css`

- [ ] **Step 1: Create IngredientsCard.jsx**

Create `frontend/src/components/cards/IngredientsCard.jsx`:
```jsx
import './IngredientsCard.css'

export function IngredientsCard({ recipe }) {
  return (
    <div className="ingredients-card">
      <h2 className="card-heading">Ingredients</h2>
      {recipe.ingredients.length === 0 ? (
        <p className="card-empty">No ingredients found.</p>
      ) : (
        <ul className="ingredients-list">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="ingredients-item">{ing}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Create `frontend/src/components/cards/IngredientsCard.css`:
```css
.ingredients-card {
  background: var(--surface);
  min-height: 100%;
}

.ingredients-list {
  list-style: none;
  padding: 0 16px 24px;
}

.ingredients-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  line-height: 1.4;
  color: var(--text-primary);
}

.ingredients-item:last-child {
  border-bottom: none;
}

.ingredients-item::before {
  content: '•';
  color: var(--accent);
  font-weight: bold;
  margin-right: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/components/cards/IngredientsCard.jsx frontend/src/components/cards/IngredientsCard.css
git commit -m "feat: add IngredientsCard"
```

---

## Task 13: InstructionsCard with Ingredient Highlighting (TDD)

**Files:**
- Create: `frontend/src/components/cards/InstructionsCard.jsx` + `InstructionsCard.css`
- Create: `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/cards/__tests__/InstructionsCard.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InstructionsCard } from '../InstructionsCard.jsx'

vi.mock('../../../api/recipes.js', () => ({
  parseIngredients: vi.fn().mockResolvedValue([
    { name: 'flour' },
    { name: 'eggs' },
  ]),
}))

const recipe = {
  ingredients: ['2 cups flour', '3 eggs'],
  instructions: ['Mix flour and eggs together', 'Pour into pan'],
}

it('renders all instruction steps', async () => {
  render(<InstructionsCard recipe={recipe} />)
  expect(screen.getByText(/Mix flour/)).toBeInTheDocument()
  expect(screen.getByText(/Pour into pan/)).toBeInTheDocument()
})

it('highlights ingredient names in steps after loading', async () => {
  render(<InstructionsCard recipe={recipe} />)
  await waitFor(() => {
    const marks = document.querySelectorAll('mark.highlight')
    expect(marks.length).toBeGreaterThan(0)
  })
})

it('renders without error if parseIngredients fails', async () => {
  const { parseIngredients } = await import('../../../api/recipes.js')
  parseIngredients.mockRejectedValueOnce(new Error('API down'))
  render(<InstructionsCard recipe={recipe} />)
  await waitFor(() => {
    expect(screen.getByText(/Mix flour/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../InstructionsCard.jsx'`

- [ ] **Step 3: Implement InstructionsCard.jsx**

Create `frontend/src/components/cards/InstructionsCard.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { parseIngredients } from '../../../api/recipes.js'
import './InstructionsCard.css'

function highlightIngredients(text, names) {
  if (!names.length) return text
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const escaped = sorted.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) => {
    const isMatch = names.some(n => n.toLowerCase() === part.toLowerCase())
    return isMatch ? <mark key={i} className="highlight">{part}</mark> : part
  })
}

export function InstructionsCard({ recipe }) {
  const [ingNames, setIngNames] = useState([])

  useEffect(() => {
    if (!recipe.ingredients.length) return
    parseIngredients(recipe.ingredients)
      .then(data => {
        const names = Array.isArray(data)
          ? data.map(item => item.name).filter(Boolean)
          : []
        setIngNames(names)
      })
      .catch(() => {})
  }, [recipe.ingredients])

  return (
    <div className="instructions-card">
      <h2 className="card-heading">Instructions</h2>
      {recipe.instructions.length === 0 ? (
        <p className="card-empty">No instructions found.</p>
      ) : (
        <ol className="instructions-list">
          {recipe.instructions.map((step, i) => (
            <li key={i} className="instructions-step">
              {highlightIngredients(step, ingNames)}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
```

Create `frontend/src/components/cards/InstructionsCard.css`:
```css
.instructions-card {
  background: var(--surface);
  min-height: 100%;
}

.instructions-list {
  list-style: none;
  padding: 0 16px 24px;
  counter-reset: step;
}

.instructions-step {
  padding: 12px 0 12px 36px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  position: relative;
  counter-increment: step;
}

.instructions-step:last-child {
  border-bottom: none;
}

.instructions-step::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 12px;
  width: 24px;
  height: 24px;
  background: var(--accent);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/components/cards/InstructionsCard.jsx frontend/src/components/cards/InstructionsCard.css frontend/src/components/cards/__tests__/InstructionsCard.test.jsx
git commit -m "feat: add InstructionsCard with ingredient highlighting"
```

---

## Task 14: NutritionCard

**Files:**
- Create: `frontend/src/components/cards/NutritionCard.jsx` + `NutritionCard.css`
- Create: `frontend/src/components/cards/__tests__/NutritionCard.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/cards/__tests__/NutritionCard.test.jsx`:
```jsx
import { it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NutritionCard } from '../NutritionCard.jsx'

vi.mock('../../../api/recipes.js', () => ({
  parseIngredients: vi.fn(),
  getNutrition: vi.fn(),
}))

import { getNutrition } from '../../../api/recipes.js'

const recipe = { ingredients: ['2 cups flour', '3 eggs'] }

it('shows spinner while loading', () => {
  getNutrition.mockReturnValue(new Promise(() => {}))
  render(<NutritionCard recipe={recipe} />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})

it('renders nutrition items on success', async () => {
  getNutrition.mockResolvedValue({
    nutrition: [
      { name: 'Flour', description: '100 kcal' },
      { name: 'Eggs', description: '70 kcal' },
    ],
  })
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument())
  expect(screen.getByText('Eggs')).toBeInTheDocument()
})

it('shows unavailable message on error', async () => {
  getNutrition.mockRejectedValue(new Error('Network error'))
  render(<NutritionCard recipe={recipe} />)
  await waitFor(() =>
    expect(screen.getByText('Nutrition data unavailable.')).toBeInTheDocument()
  )
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd frontend && npm run test:run
```

Expected: `Cannot find module '../NutritionCard.jsx'`

- [ ] **Step 3: Implement NutritionCard.jsx**

Create `frontend/src/components/cards/NutritionCard.jsx`:
```jsx
import { useState, useEffect } from 'react'
import { getNutrition } from '../../../api/recipes.js'
import { Spinner } from '../../ui/Spinner.jsx'
import './NutritionCard.css'

export function NutritionCard({ recipe }) {
  const [nutrition, setNutrition] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!recipe.ingredients.length) {
      setLoading(false)
      return
    }
    getNutrition(recipe.ingredients)
      .then(data => {
        setNutrition(data.nutrition || [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [recipe.ingredients])

  return (
    <div className="nutrition-card">
      <h2 className="card-heading">Nutrition</h2>
      {loading && <Spinner message="Loading nutrition info…" />}
      {!loading && error && (
        <p className="card-empty">Nutrition data unavailable.</p>
      )}
      {!loading && !error && !nutrition?.length && (
        <p className="card-empty">No nutrition data found.</p>
      )}
      {!loading && !error && nutrition?.length > 0 && (
        <ul className="nutrition-list">
          {nutrition.filter(Boolean).map((item, i) => (
            <li key={i} className="nutrition-item">
              <span className="nutrition-name">{item.name}</span>
              {item.description && (
                <span className="nutrition-desc">{item.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

Create `frontend/src/components/cards/NutritionCard.css`:
```css
.nutrition-card {
  background: var(--surface);
  min-height: 100%;
}

.nutrition-list {
  list-style: none;
  padding: 0 16px 24px;
}

.nutrition-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.nutrition-item:last-child {
  border-bottom: none;
}

.nutrition-name {
  font-weight: 500;
  color: var(--text-primary);
}

.nutrition-desc {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: right;
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm run test:run
```

Expected: `3 tests passed`

- [ ] **Step 5: Commit**

```bash
cd ..
git add frontend/src/components/cards/NutritionCard.jsx frontend/src/components/cards/NutritionCard.css frontend/src/components/cards/__tests__/NutritionCard.test.jsx
git commit -m "feat: add NutritionCard with lazy loading"
```

---

## Task 15: TabBar

**Files:**
- Create: `frontend/src/components/TabBar.jsx` + `TabBar.css`

- [ ] **Step 1: Create TabBar.jsx**

Create `frontend/src/components/TabBar.jsx`:
```jsx
import { NavLink } from 'react-router-dom'
import './TabBar.css'

const TABS = [
  { to: '/scrape', label: 'Scrape', icon: '🔗' },
  { to: '/search', label: 'Search', icon: '🔍' },
  { to: '/saved',  label: 'Saved',  icon: '⭐' },
]

export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Main navigation">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `tab-item${isActive ? ' tab-item--active' : ''}`
          }
        >
          <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
          <span className="tab-label">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

Create `frontend/src/components/TabBar.css`:
```css
.tab-bar {
  display: flex;
  height: var(--tab-height);
  background: var(--surface);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.06);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  text-decoration: none;
  color: var(--text-secondary);
  transition: color 0.15s;
}

.tab-item--active {
  color: var(--accent);
}

.tab-icon {
  font-size: 20px;
  line-height: 1;
}

.tab-label {
  font-size: 11px;
  font-weight: 500;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/components/TabBar.jsx frontend/src/components/TabBar.css
git commit -m "feat: add TabBar with react-router NavLink"
```

---

## Task 16: ScrapePage

**Files:**
- Create: `frontend/src/pages/ScrapePage.jsx` + `ScrapePage.css`

- [ ] **Step 1: Create ScrapePage.jsx**

Create `frontend/src/pages/ScrapePage.jsx`:
```jsx
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { scrapeRecipe } from '../api/recipes.js'
import { normalizeScraped } from '../lib/normalize.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx'
import './ScrapePage.css'

const SLOW_MESSAGE_DELAY = 5000

export function ScrapePage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [slowMessage, setSlowMessage] = useState(false)
  const [error, setError] = useState(null)
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()
  const timerRef = useRef(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!url.trim()) return
    setError(null)
    setLoading(true)
    setSlowMessage(false)
    timerRef.current = setTimeout(() => setSlowMessage(true), SLOW_MESSAGE_DELAY)
    try {
      const data = await scrapeRecipe(url.trim())
      setRecipe(normalizeScraped(data))
      navigate('/recipe')
    } catch (err) {
      if (err.status === 404) {
        setError("Couldn't find a recipe on that page.")
      } else {
        setError(err.message || 'Failed to scrape recipe.')
      }
    } finally {
      clearTimeout(timerRef.current)
      setLoading(false)
      setSlowMessage(false)
    }
  }

  return (
    <div className="scrape-page">
      <header className="page-header">
        <h1 className="page-title">Recipe Scraper</h1>
      </header>
      <main className="scrape-main">
        <form className="scrape-form" onSubmit={handleSubmit}>
          <input
            className="scrape-input"
            type="url"
            placeholder="Paste a recipe URL…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
            autoComplete="url"
          />
          <button
            className="scrape-btn"
            type="submit"
            disabled={loading || !url.trim()}
          >
            {loading ? 'Scraping…' : 'Scrape'}
          </button>
        </form>
        {loading && (
          <Spinner message={slowMessage ? 'Waking up the server…' : 'Scraping recipe…'} />
        )}
        {error && !loading && (
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        )}
      </main>
    </div>
  )
}
```

Create `frontend/src/pages/ScrapePage.css`:
```css
.scrape-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.scrape-main {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scrape-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scrape-input {
  width: 100%;
  padding: 14px 16px;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 16px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.scrape-input:focus {
  border-color: var(--accent);
}

.scrape-btn {
  width: 100%;
  padding: 14px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-md);
  font-size: 16px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.scrape-btn:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/pages/ScrapePage.jsx frontend/src/pages/ScrapePage.css
git commit -m "feat: add ScrapePage with cold-start delay message"
```

---

## Task 17: SearchPage

**Files:**
- Create: `frontend/src/pages/SearchPage.jsx` + `SearchPage.css`

- [ ] **Step 1: Create SearchPage.jsx**

Create `frontend/src/pages/SearchPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchRecipes } from '../api/recipes.js'
import { normalizeSearchResult } from '../lib/normalize.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import { Spinner } from '../components/ui/Spinner.jsx'
import { ErrorMessage } from '../components/ui/ErrorMessage.jsx'
import './SearchPage.css'

export function SearchPage() {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!term.trim()) return
    setError(null)
    setLoading(true)
    setSearched(true)
    try {
      const data = await searchRecipes(term.trim())
      setResults(data.recipes || [])
    } catch (err) {
      setError(err.message || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (rawItem) => {
    setRecipe(normalizeSearchResult(rawItem))
    navigate('/recipe')
  }

  return (
    <div className="search-page">
      <header className="page-header">
        <h1 className="page-title">Search Recipes</h1>
      </header>
      <main className="search-main">
        <form className="search-form" onSubmit={handleSearch}>
          <input
            className="search-input"
            type="search"
            placeholder="Search 13,000+ recipes…"
            value={term}
            onChange={e => setTerm(e.target.value)}
          />
          <button
            className="search-btn"
            type="submit"
            disabled={loading || !term.trim()}
          >
            Search
          </button>
        </form>
        {loading && <Spinner message="Searching…" />}
        {error && !loading && (
          <ErrorMessage message={error} onRetry={() => setError(null)} />
        )}
        {!loading && searched && results.length === 0 && !error && (
          <p className="search-empty">No results found.</p>
        )}
        {results.length > 0 && (
          <ul className="search-results">
            {results.map((item, i) => (
              <li key={i}>
                <SearchResultItem
                  recipe={{ title: item.Title, image: item.Image_Name || null }}
                  onClick={() => handleSelect(item)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
```

Create `frontend/src/pages/SearchPage.css`:
```css
.search-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.search-main {
  flex: 1;
  overflow-y: auto;
}

.search-form {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 5;
}

.search-input {
  flex: 1;
  padding: 10px 14px;
  background: var(--bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 15px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--accent);
}

.search-btn {
  padding: 10px 18px;
  background: var(--accent);
  color: white;
  border-radius: var(--radius-sm);
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
  transition: opacity 0.2s;
}

.search-btn:disabled {
  opacity: 0.5;
}

.search-empty {
  padding: 24px 16px;
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
}

.search-results {
  list-style: none;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/pages/SearchPage.jsx frontend/src/pages/SearchPage.css
git commit -m "feat: add SearchPage with 13k recipe search"
```

---

## Task 18: SavedPage

**Files:**
- Create: `frontend/src/pages/SavedPage.jsx` + `SavedPage.css`

- [ ] **Step 1: Create SavedPage.jsx**

Create `frontend/src/pages/SavedPage.jsx`:
```jsx
import { useNavigate } from 'react-router-dom'
import { useFavorites } from '../hooks/useFavorites.js'
import { useRecipe } from '../context/RecipeContext.jsx'
import { SearchResultItem } from '../components/ui/SearchResultItem.jsx'
import './SavedPage.css'

export function SavedPage() {
  const { favorites } = useFavorites()
  const { setRecipe } = useRecipe()
  const navigate = useNavigate()

  const handleSelect = (recipe) => {
    setRecipe(recipe)
    navigate('/recipe')
  }

  return (
    <div className="saved-page">
      <header className="page-header">
        <h1 className="page-title">Saved Recipes</h1>
      </header>
      <main className="saved-main">
        {favorites.length === 0 ? (
          <div className="saved-empty">
            <p className="saved-empty__text">No saved recipes yet.</p>
            <p className="saved-empty__hint">
              Tap ♡ on any recipe to save it here.
            </p>
          </div>
        ) : (
          <ul className="saved-list">
            {favorites.map(recipe => (
              <li key={recipe.id}>
                <SearchResultItem
                  recipe={recipe}
                  onClick={() => handleSelect(recipe)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
```

Create `frontend/src/pages/SavedPage.css`:
```css
.saved-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.saved-main {
  flex: 1;
  overflow-y: auto;
}

.saved-empty {
  padding: 48px 24px;
  text-align: center;
}

.saved-empty__text {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.saved-empty__hint {
  font-size: 14px;
  color: var(--text-secondary);
}

.saved-list {
  list-style: none;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/pages/SavedPage.jsx frontend/src/pages/SavedPage.css
git commit -m "feat: add SavedPage with local favorites list"
```

---

## Task 19: RecipeDetailPage

**Files:**
- Create: `frontend/src/pages/RecipeDetailPage.jsx` + `RecipeDetailPage.css`

- [ ] **Step 1: Create RecipeDetailPage.jsx**

Create `frontend/src/pages/RecipeDetailPage.jsx`:
```jsx
import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRecipe } from '../context/RecipeContext.jsx'
import { useFavorites } from '../hooks/useFavorites.js'
import { saveRecipe } from '../api/recipes.js'
import { RecipeCarousel } from '../components/RecipeCarousel.jsx'
import { ImageCard } from '../components/cards/ImageCard.jsx'
import { IngredientsCard } from '../components/cards/IngredientsCard.jsx'
import { InstructionsCard } from '../components/cards/InstructionsCard.jsx'
import { NutritionCard } from '../components/cards/NutritionCard.jsx'
import './RecipeDetailPage.css'

export function RecipeDetailPage() {
  const { recipe } = useRecipe()
  const navigate = useNavigate()
  const { isFavorite, addFavorite, removeFavorite } = useFavorites()
  const [saveDbState, setSaveDbState] = useState('idle')

  if (!recipe) {
    return <Navigate to="/scrape" replace />
  }

  const fav = isFavorite(recipe.id)

  const handleToggleFav = () => {
    fav ? removeFavorite(recipe.id) : addFavorite(recipe)
  }

  const handleSaveToDb = async () => {
    if (saveDbState === 'loading' || saveDbState === 'saved' || saveDbState === 'duplicate') return
    setSaveDbState('loading')
    try {
      await saveRecipe(recipe)
      setSaveDbState('saved')
    } catch (err) {
      if (err.status === 400) {
        setSaveDbState('duplicate')
      } else {
        setSaveDbState('error')
        setTimeout(() => setSaveDbState('idle'), 3000)
      }
    }
  }

  return (
    <div className="recipe-detail-page">
      <header className="detail-header">
        <button
          className="detail-back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ‹ Back
        </button>
      </header>
      <RecipeCarousel
        slides={[
          <ImageCard
            recipe={recipe}
            isFav={fav}
            onToggleFav={handleToggleFav}
            saveDbState={saveDbState}
            onSaveToDb={handleSaveToDb}
          />,
          <IngredientsCard recipe={recipe} />,
          <InstructionsCard recipe={recipe} />,
          <NutritionCard recipe={recipe} />,
        ]}
      />
    </div>
  )
}
```

Create `frontend/src/pages/RecipeDetailPage.css`:
```css
.recipe-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  height: 100dvh;
  background: var(--surface);
}

.detail-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
  z-index: 10;
}

.detail-back {
  font-size: 17px;
  color: var(--accent);
  padding: 8px 0;
  font-weight: 500;
}
```

- [ ] **Step 2: Commit**

```bash
cd ..
git add frontend/src/pages/RecipeDetailPage.jsx frontend/src/pages/RecipeDetailPage.css
git commit -m "feat: add RecipeDetailPage with 4-card swipeable carousel"
```

---

## Task 20: App.jsx + main.jsx + index.html

**Files:**
- Create: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/index.html`

- [ ] **Step 1: Create App.jsx**

Create `frontend/src/App.jsx`:
```jsx
import { createHashRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { RecipeProvider } from './context/RecipeContext.jsx'
import { TabBar } from './components/TabBar.jsx'
import { ScrapePage } from './pages/ScrapePage.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { SavedPage } from './pages/SavedPage.jsx'
import { RecipeDetailPage } from './pages/RecipeDetailPage.jsx'
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
  {
    element: <TabLayout />,
    children: [
      { path: '/scrape', element: <ScrapePage /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/saved',  element: <SavedPage /> },
    ],
  },
  { path: '/recipe', element: <RecipeDetailPage /> },
])

export default function App() {
  return (
    <RecipeProvider>
      <RouterProvider router={router} />
    </RecipeProvider>
  )
}
```

- [ ] **Step 2: Update main.jsx**

Replace `frontend/src/main.jsx` with:
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 3: Update index.html title**

In `frontend/index.html`, replace the `<title>` tag content:
```html
<title>Recipe Scraper</title>
```

Also add a viewport meta tag if not present (Vite template adds it, but verify):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

- [ ] **Step 4: Run all tests to ensure nothing is broken**

```bash
cd frontend && npm run test:run
```

Expected: all previously passing tests still pass.

- [ ] **Step 5: Start dev server and manually verify the app**

```bash
npm run dev
```

Open `http://localhost:5173` in a browser. Verify:
- Default route redirects to `/scrape`
- Scrape tab shows input + button
- Search tab shows search form
- Saved tab shows empty state message
- TabBar highlights the active tab
- Navigating between tabs works

- [ ] **Step 6: Commit**

```bash
cd ..
git add frontend/src/App.jsx frontend/src/main.jsx frontend/index.html
git commit -m "feat: wire up hash router with tab layout and all pages"
```

---

## Task 21: Capacitor Android Setup

**Files:**
- Creates: `frontend/android/` (generated by Capacitor)

- [ ] **Step 1: Build the web app**

```bash
cd frontend
npm run build
```

Expected: `dist/` directory created with `index.html` and bundled JS/CSS.

- [ ] **Step 2: Initialize Capacitor in the frontend**

```bash
npx cap init "Recipe Scraper" "com.haydenclark.recipescraper" --web-dir dist
```

Expected: `capacitor.config.json` updated (or confirms existing config). Say yes to overwrite if prompted — the settings match what's already in `capacitor.config.json`.

- [ ] **Step 3: Add Android platform**

```bash
npx cap add android
```

Expected: `android/` directory created with a Gradle project.

- [ ] **Step 4: Sync the built web assets**

```bash
npx cap sync android
```

Expected: `Copying web assets... done` and `Updating Android plugins...`

- [ ] **Step 5: Open in Android Studio**

```bash
npx cap open android
```

Expected: Android Studio opens with the project. If Android Studio is not installed, download it from https://developer.android.com/studio.

- [ ] **Step 6: Run on emulator**

In Android Studio:
- Select an emulator (create one via AVD Manager if needed: Pixel 6, API 34)
- Click the green Run ▶ button

Expected: app launches in the emulator, shows the Scrape tab. Test scraping a recipe URL.

- [ ] **Step 7: Add android/ to .gitignore (optional)**

The `android/` directory is large and regeneratable. If you prefer not to commit it:
Add to `frontend/.gitignore`:
```
android/
dist/
```

If you want to commit it (needed for CI/CD builds), skip this step.

- [ ] **Step 8: Commit**

```bash
cd ..
git add frontend/.gitignore
git commit -m "feat: configure capacitor android packaging"
```

---

## Workflow: Rebuilding After Frontend Changes

Whenever you change React code and want to test on Android:

```bash
cd frontend
npm run build
npx cap sync android
# Then run from Android Studio or: npx cap run android
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Vite + React 19, all .jsx files — Task 1
- ✅ Capacitor Android packaging — Task 21
- ✅ Hash-based router (createHashRouter) — Task 20
- ✅ embla-carousel-react — Task 10
- ✅ @capacitor/preferences for favorites — Task 6
- ✅ Plain CSS with tokens.css — Task 7
- ✅ VITE_API_URL env var — Task 1
- ✅ POST /scrape-recipe — Tasks 5, 16
- ✅ POST /search-recipies — Tasks 5, 17
- ✅ POST /get-nutrition — Tasks 5, 14
- ✅ POST /parse-ingredients-api — Tasks 5, 13
- ✅ POST /save-recipe — Tasks 5, 19
- ✅ Bottom tabs: Scrape / Search / Saved — Tasks 15, 20
- ✅ RecipeDetailPage outside TabLayout (no tab bar) — Task 20
- ✅ 4-card carousel: Image → Ingredients → Instructions → Nutrition — Tasks 10–14, 19
- ✅ normalizeScraped + normalizeSearchResult — Task 3
- ✅ Local favorites on-device — Task 6, 18
- ✅ Add to database button (scrape only) — Task 11
- ✅ 400 duplicate → friendly "Already in database" — Task 19
- ✅ Render cold-start "Waking up the server…" — Task 16
- ✅ 404 → "Couldn't find a recipe on that page." — Task 16
- ✅ Ingredient name highlighting in instructions — Task 13
- ✅ Lazy nutrition load — Task 14
- ✅ Vitest + RTL tests — Tasks 2–6, 11, 13, 14
- ✅ Clean light minimalist style — Task 7

**No placeholders found.**

**Type consistency confirmed:** `recipe` shape is always the normalized model from `normalize.js`; `saveDbState` is `'idle' | 'loading' | 'saved' | 'duplicate' | 'error'` throughout Tasks 11 and 19; `useFavorites` exports `{ favorites, addFavorite, removeFavorite, isFavorite }` consistently referenced in Tasks 6, 18, 19.
