# Recipe Scraper — Frontend Design

**Date:** 2026-05-30
**Status:** Approved

## Goal

Rebuild the deleted frontend as a mobile-first **React web app** written in `.jsx`,
consuming the existing Node/Express backend (`backend/server.js`). The app is wrapped
with **Capacitor** into an Android app for submission to the **Samsung Galaxy Store**.

The previous frontend was React Native/Expo. This is a fresh web-React rebuild, not a
React Native project.

## Decisions (locked during brainstorming)

- **Platform:** mobile-first React web app, packaged with Capacitor → Android AAB.
- **Features:** all five backend endpoints are used.
- **Navigation:** bottom tab bar (Scrape / Search / Saved) + a pushed full-screen
  recipe detail page with swipeable cards.
- **Saving — two distinct concepts:**
  - **Local favorites** (⭐ tab + heart button) stored on-device via
    `@capacitor/preferences`. Private.
  - **Add to database** button calls `POST /save-recipe`, contributing to the shared
    13k-recipe CSV. Public.
- **Backend URL:** from `VITE_API_URL`, defaulting to the deployed Render URL.
- **Visual style:** clean light minimalist — neutral background, single accent color,
  rounded cards, system font stack.

## Tech Stack

- **Vite + React 19**, all components `.jsx`, mobile-first CSS.
- **Capacitor** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`,
  `@capacitor/preferences`) to package the built `dist/` as an Android app.
  App id: `com.haydenclark.recipescraper`, `webDir: dist`.
- **Routing:** `react-router-dom` using `createHashRouter` — hash routing is required
  because Capacitor serves from a local file origin where path-based routing breaks.
- **Carousel:** `embla-carousel-react` (lightweight, touch-native) for the swipeable
  detail cards, replacing the old `react-native-reanimated-carousel`.
- **Favorites storage:** `@capacitor/preferences`, with a `localStorage` fallback when
  running in a plain browser during dev.
- **Styling:** plain CSS — a `tokens.css` design-token file (accent color, neutrals,
  radius, spacing, font stack) plus per-component CSS. No heavy UI library.
- **Testing:** Vitest + React Testing Library.

## Backend Contract (existing, unchanged)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /scrape-recipe` | `{ url }` | `{ title, ingredients[], prepTime, totalTime, servings, category, cuisine, instructions[], image }` |
| `POST /search-recipies` | `{ search }` | `{ recipes: [{ Title, Cleaned_Ingredients, Instructions, Image_Name }] }` |
| `POST /get-nutrition` | `{ ingredients[] }` | `{ nutrition: [{ name, description, brand }] }` |
| `POST /parse-ingredients-api` | `{ ingredients }` | Spoonacular parsed-ingredient objects (used to highlight ingredient names in instructions) |
| `POST /save-recipe` | `{ recipe }` | `200 { message: "Recipe saved" }` or `400 { message: "Recipe already in database" }` |

## Project Structure

```
frontend/
  index.html
  vite.config.js
  capacitor.config.json
  package.json
  .env.example                 # VITE_API_URL
  src/
    main.jsx
    App.jsx                     # hash router + tab layout shell
    api/
      client.js                # fetch wrapper, base URL from VITE_API_URL, throws on non-2xx
      recipes.js               # scrapeRecipe / searchRecipes / getNutrition / parseIngredients / saveRecipe
    hooks/
      useFavorites.js          # Capacitor Preferences CRUD (add/remove/list/isFavorite)
    lib/
      normalize.js             # unify scrape + CSV shapes into one recipe model
    context/
      RecipeContext.jsx        # holds the currently-viewed recipe across navigation
    pages/
      ScrapePage.jsx
      SearchPage.jsx
      SavedPage.jsx
      RecipeDetailPage.jsx
    components/
      TabBar.jsx
      RecipeCarousel.jsx       # embla wrapper + dots
      PaginationDots.jsx
      cards/
        ImageCard.jsx          # hero image, title, meta, favorite + "Add to database" button
        IngredientsCard.jsx
        InstructionsCard.jsx   # highlights ingredient names in steps
        NutritionCard.jsx      # lazy-loads nutrition
      ui/
        Spinner.jsx
        ErrorMessage.jsx
        SearchResultItem.jsx
    styles/
      tokens.css
      global.css
```

## Data Model

A single normalized recipe shape feeds every card, because the two sources differ:

```js
{
  id,            // stable id (e.g. derived from title + image) — used for favorites
  title,
  image,         // string URL or null
  ingredients,   // string[]
  instructions,  // string[]
  prepTime, totalTime, servings,
  category,      // array or string
  cuisine,       // array or string
  source,        // 'scrape' | 'search' | 'favorite'
}
```

- **Scrape** responses already provide arrays — map directly.
- **Search** responses provide strings (`Cleaned_Ingredients`, `Instructions`);
  `normalize.js` splits them into arrays (matching how the old app split on newlines /
  separators) and maps `Image_Name` → `image`, `Title` → `title`.

## Data Flow

- **Scrape:** URL input → `POST /scrape-recipe` → `normalize()` → store in
  `RecipeContext` → navigate to detail. `source: 'scrape'`.
- **Search:** term → `POST /search-recipies` → render result list → tap item →
  `normalize()` → detail. `source: 'search'`.
- **Detail page (swipeable cards):**
  - **Image card:** hero image, title, prep/total time, servings, category/cuisine.
    Heart button toggles local favorite. **"Add to database" button shows only when
    `source === 'scrape'`** (search/favorite recipes are already in or from the DB).
  - **Ingredients card:** the ingredient list.
  - **Instructions card:** steps with ingredient names highlighted. On mount, calls
    `POST /parse-ingredients-api` with the ingredients to get canonical names, then
    highlights matches within each step's text.
  - **Nutrition card:** lazy — calls `POST /get-nutrition` with the ingredients when the
    card is first reached; shows a spinner while loading.
- **Saved:** `useFavorites` reads from Preferences → list → tap → detail
  (`source: 'favorite'`).

## Saving Behavior

- **Local favorites:** heart button on the image card adds/removes the normalized recipe
  in `@capacitor/preferences`. The ⭐ Saved tab lists them. Fully offline/local.
- **Add to database:** button on the image card (scraped recipes only) calls
  `POST /save-recipe`.
  - `200` → button shows "Added!".
  - `400 { message: "Recipe already in database" }` → friendly "Already in database"
    state, not an error.
  - The backend already rejects recipes whose `image` starts with the GitHub raw URL, so
    the UI gating (`source === 'scrape'`) and this 400 handling are complementary.

## Error Handling & Edge Cases

- `client.js` throws on non-2xx; pages catch and render `<ErrorMessage>` with a retry
  action.
- **Scrape 404** ("Recipe not found") → "Couldn't find a recipe on that page."
- **Render cold start:** the free tier sleeps; the first scrape may take ~30s. After a
  few seconds the loading spinner switches its label to "Waking up the server…" so it
  doesn't appear frozen.
- **Empty search** → backend returns 400 "Search term required"; the UI prevents
  submitting an empty term.
- **Missing image** → image card renders a placeholder.
- **Nutrition gaps** → some ingredients may return no match; the nutrition card skips or
  labels those entries instead of failing the whole card.

## Testing Strategy

- **Unit (Vitest + RTL):**
  - `normalize.js` — both scrape and CSV inputs produce the correct normalized shape,
    including string→array splitting.
  - `useFavorites` — add/remove/list/isFavorite round-trips through the storage layer
    (mocked Preferences).
  - Cards render given a normalized recipe; "Add to database" button visibility honors
    `source`.
  - API layer (`recipes.js`) with mocked `fetch` — correct URLs/bodies, error throwing.
- **Manual:** run the Vite dev server against the local backend (`localhost:7000`), then
  `npx cap run android` on an emulator/device before Galaxy Store submission.

## Packaging / Deployment Notes

- Build pipeline: `vite build` → `npx cap sync android` → open in Android Studio → build
  a signed AAB for the Galaxy Store.
- Android webview → `https://...onrender.com` works over HTTPS. Testing on a physical
  device against a local backend requires the machine's LAN IP (not `localhost`) and
  cleartext config — production builds use the HTTPS Render URL, so this only affects dev.

## Out of Scope (v1)

- User accounts / cloud sync of favorites (favorites are local-only).
- Editing recipes.
- iOS packaging (Android/Galaxy Store first; the web build is reusable later).
