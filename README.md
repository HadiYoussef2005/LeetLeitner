# LeetLeitner

A local-first, three-bucket spaced-repetition tracker for active LeetCode practice.

## Run

Requires Node.js 20.19+.

```sh
npm install
npm run dev
```

## Validate and build

```sh
npm test
npm run build
npm run preview
```

React + TypeScript + Vite, with custom responsive CSS and LocalStorage persistence. No account, backend, scraping, or cloud sync. Production builds include a service worker that caches the application shell for offline use after the first successful visit. Development mode does not register the service worker. Optional web fonts fall back to system fonts offline.

## Rules

- Couldn't Solve → Bucket 1, default 2 days (configurable 1–2).
- Solved with Help → Bucket 2, default 4 days (configurable 3–4).
- Solved independently → Bucket 3, default 10 days (configurable 7–14).
- A failed attempt from any bucket immediately returns to Bucket 1.
- Due dates use local calendar days; events use UTC timestamps.
- Skipping leaves schedules unchanged. Early attempts restart the schedule.
- Corrections restart the schedule without counting a review; metadata edits preserve it.
- Preference changes apply only to subsequent scheduling events.

Storage is scoped to this browser and origin. Clearing browser data removes progress. One active editing tab is supported; a detected change from another tab locks writes until reload. Invalid or unsupported stored data is preserved, with a recovery download available. Schema version 1 is the initial format; unknown future schemas are rejected safely.

## Architecture

`src/engine.ts` contains pure scheduling and validation functions. `src/storage.ts` owns the versioned storage contract. `src/App.tsx` coordinates dashboard, entry, history, preferences, and review sessions. Writes persist before successful UI confirmation, and storage failures leave prior UI state intact.

## Verification

Unit tests cover the transition matrix, calendar boundaries, due ordering, metadata-independent sorting, initial-attempt semantics, reclassification, duplicate detection, and malformed storage. Browser workflow and performance verification are documented in `VERIFICATION.md` when executed. No claim of WCAG certification is made; the app uses accessible dialogs, native controls, labels, visible focus, and non-color outcome indicators.
