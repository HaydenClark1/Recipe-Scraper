# Plan: Amount panel — supported-units dropdown

**Date:** 2026-06-04
**Scope:** Frontend only. Replace the free-text "Unit" input in the ingredient editor's Amount panel with a scrollable dropdown that lists **only** units we can convert to grams.

## Problem

`AmountPanel` (`frontend/src/components/IngredientsEditor.jsx:49`) currently has a free-text Unit `<input>`. Users can type anything — including units the backend cannot convert (`clove`, `can`, `slice`, "tblspn" typos, etc.). When the typed unit isn't in `backend/nutrition/units.js` → `GRAMS`, `toGrams` returns `null`, the line falls back to an approximate estimate and gets flagged `needsAmount`. Setting an amount via this panel is the *suggested fix* for needs-amount lines, so letting the user pick an unconvertible unit defeats the purpose.

## Goal

The Amount panel's unit selection is a **dropdown (native `<select>`, scrollable)** showing only the units the backend can convert. Quantity stays a numeric input. Applying is only possible once both quantity and a supported unit are chosen.

## Source of truth for "supported units"

`backend/nutrition/units.js` `GRAMS` keys. Canonical set (one entry per unit, not every alias):

- **Mass:** `g` (grams), `kg` (kilograms), `oz` (ounces), `lb` (pounds)
- **Volume:** `ml` (milliliters), `l` (liters), `tsp` (teaspoons), `tbsp` (tablespoons), `cup` (cups), `pint`, `quart`, `gallon`

Values sent to `editor.setAmount` use the canonical backend key (e.g. `cup`, `g`) so both `toGrams` lookup and the exact basis-unit match path (`combine.js:110`, `unit === desc.basis.unit`) keep working. This matches the existing test expectation `setAmount('a', 0.25, 'cup')`.

## Decisions

- **Native `<select>`** over a custom dropdown: scrolls for free, accessible, best behavior inside the Capacitor webview on phones. No new dependency.
- **`<optgroup>` Mass / Volume** for scannability; placeholder option "Select unit" (empty value, disabled once chosen).
- **No free-text escape hatch.** The whole point is to restrict to convertible units. Count-based amounts (e.g. "1 breast") are handled by picking a weight unit + value, which is the intended needs-amount fix.
- **Frontend constant, not a backend fetch.** Keep it simple; add a `frontend/src/lib/units.js` constant with a comment that it mirrors backend `GRAMS`, plus a guard test so drift is caught.

## Implementation (TDD slices)

Invoke the **ui-ux-pro-max** skill before writing the JSX (per project UI rule), and keep the layout mobile-first.

### Slice 1 — Supported-units constant
- **Test** (`frontend/src/lib/__tests__/units.test.js`): asserts the exported list contains the canonical convertible units and excludes non-convertible words (`clove`, `can`, `slice`, `pinch`); every `value` is lowercase and label is non-empty.
- **Code:** `frontend/src/lib/units.js` exporting e.g.
  ```js
  // Mirrors convertible keys in backend/nutrition/units.js GRAMS.
  export const SUPPORTED_UNITS = [
    { group: 'Mass',   value: 'g',     label: 'Grams (g)' },
    { group: 'Mass',   value: 'kg',    label: 'Kilograms (kg)' },
    { group: 'Mass',   value: 'oz',    label: 'Ounces (oz)' },
    { group: 'Mass',   value: 'lb',    label: 'Pounds (lb)' },
    { group: 'Volume', value: 'ml',    label: 'Milliliters (ml)' },
    { group: 'Volume', value: 'l',     label: 'Liters (l)' },
    { group: 'Volume', value: 'tsp',   label: 'Teaspoons (tsp)' },
    { group: 'Volume', value: 'tbsp',  label: 'Tablespoons (tbsp)' },
    { group: 'Volume', value: 'cup',   label: 'Cups' },
    { group: 'Volume', value: 'pint',  label: 'Pints' },
    { group: 'Volume', value: 'quart', label: 'Quarts' },
    { group: 'Volume', value: 'gallon',label: 'Gallons' },
  ]
  ```

### Slice 2 — AmountPanel dropdown
- **Test** (`frontend/src/components/__tests__/IngredientsEditor.test.jsx`):
  - Update the existing amount test (`:91`) to select `cup` from the dropdown + type `0.25`, still expecting `setAmount('a', 0.25, 'cup')`.
  - New: the unit control is a `<select>`; its options include `cup`/`g` and do **not** include `clove`/`can`.
  - New: "Apply" is disabled until both qty and a unit are chosen.
- **Code:** in `AmountPanel`, replace the unit `<input>` with a `<select>` (placeholder + `<optgroup>`s from `SUPPORTED_UNITS`), keep `qty` numeric input, gate `onApply` on `qty && unit`.

### Slice 3 — Styling (mobile-first)
- Add/adjust `.ing-panel__unit` (now a select) in `IngredientsEditor.css` so the select sits in the row layout, is full-width-friendly on narrow screens, and has comfortable tap height. Native scroll handles long lists.

## Out of scope
- Backend changes (conversion table, parsing, basis matching) — unchanged.
- Quantity validation beyond "present and numeric".
- Sharing one unit list across frontend/backend via a build step (the mirror + guard test is sufficient for now).

## Verification
- `cd frontend && npm test` (Vitest) — units + IngredientsEditor suites green.
- Manual: open editor, "Amount" on a line, confirm dropdown scrolls, only supported units listed, applying recomputes nutrition and clears any "⚠ Needs amount" badge for that line.
