# LeetLeitner

A local-first, three-bucket spaced-repetition tracker for active LeetCode practice.

## Run

Requires Node.js 20.19+.

```sh
npm install
npm run dev
```

Open the printed `/leetleitner/` URL. The app is prepared to deploy beneath that path. See [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel setup and connection to the existing portfolio.

## Validate and build

```sh
npm test
npm run build
npm run preview
```

React + TypeScript + Vite, with a responsive notebook interface and LocalStorage persistence. No account, database, or cloud sync. A read-only Vercel function fetches public problem metadata from LeetCode; review records and backups remain in the browser. Production builds include a service worker that caches the application shell for offline use after the first successful visit. Development mode does not register the service worker. Optional IBM Plex fonts fall back to system fonts offline.

## Add a problem

Paste a LeetCode problem link or enter its displayed number (for example, `1` or `#1`). After a short pause, the app resolves its title, number, difficulty, tags, and canonical URL. Select your attempt outcome and click **Add problem**. Description/solution links and links with sharing parameters are normalized automatically. Pressing **Find problem** runs the lookup immediately.

Problems already in your notebook open the existing record rather than creating duplicates. You can use **Edit details manually** to adjust fetched metadata, or **Enter manually** if lookup is unavailable. Manual entry, reviews, and file backups work offline; new metadata lookups require a connection.

The browser calls `GET /leetleitner/api/problem.json?input=…`. The server makes GET requests to LeetCode's GraphQL metadata endpoint; for a number it first resolves the displayed problem number through LeetCode's public problem catalogue. This avoids cross-origin browser restrictions and does not fetch protected HTML pages, solutions, submissions, or account information. No LeetCode cookies or API keys are required. These upstream endpoints can change or deny requests; failures never save guessed metadata.

Public metadata is cached for an hour and identical in-flight requests are shared. Requests have timeouts and bounded response sizes. Only fixed `leetcode.com` endpoints are contacted; arbitrary pasted URLs are rejected. Vite dev and preview provide the same endpoint locally, while production needs the included Vercel function (static-file-only hosts retain manual entry).

```sh
# With npm run preview -- --port 4173 running:
npm run test:link-input
```

## Rules

Drag a problem card onto another bucket to correct its classification. The destination highlights while dragging. A move restarts its review schedule from today using the destination bucket's interval, records a reclassification, and does not count as a completed review. Dropping in the same bucket or canceling leaves it unchanged. On touch devices or with a keyboard, open the problem and use **Correct bucket** instead.

With the preview running on port 4173, run `npm run test:drag-drop` to verify movement, persistence, scheduling, canceled drops, and storage failures.

- Couldn't Solve → Bucket 1, default 2 days (configurable 1–2).
- Solved with Help → Bucket 2, default 4 days (configurable 3–4).
- Solved independently → Bucket 3, default 10 days (configurable 7–14).
- A failed attempt from any bucket immediately returns to Bucket 1.
- Due dates use local calendar days; events use UTC timestamps.
- Skipping leaves schedules unchanged. Early attempts restart the schedule.
- Corrections restart the schedule without counting a review; metadata edits preserve it.
- Preference changes apply only to subsequent scheduling events.

Storage is scoped to this browser and origin. Clearing browser data removes progress. One active editing tab is supported; a detected change from another tab locks writes until reload. Invalid or unsupported stored data is preserved, with a recovery download available. Schema version 1 is the initial format; unknown future schemas are rejected safely.

## Export, import, and restore

Open **Preferences → Data & Backups**.

- **Export current state** downloads a single UTF-8 `.txt` file containing JSON: all problems, IDs, attempt history, schedules, intervals, and sorting preferences. No account or network connection is needed.
- **Import state** validates an export (maximum 10 MiB) in a background worker, then shows counts, history, intervals, and an explicit replacement confirmation. Import fully replaces your system; it does not merge collections or recalculate dates.
- Each successful import saves the current system as **one previous backup**. If a backup already exists, the preview warns that it will be overwritten and offers a download first.
- **Download previous backup** creates an importable `.txt` file. **Restore previous backup** swaps the active system and backup after confirmation, so you can reverse a restore.
- Invalid files, cancellation, storage quota failures, and stale previews leave the active state and backup unchanged. Replacing the system resets filters, pagination, selected problems, and review sessions.

The local backup disappears if browser site data is cleared. Download a file for recovery on another device or after clearing browser data. The application migrates the original state into storage envelope version 2 under the same `leetleitner.v1` key. Active state and backup commit together in one storage write; export format version 1 and state schema version 1 are separate from storage versioning.

With a production preview running on port 4173, verify data portability with:

```sh
npm run test:portability
npm run test:restart
```

## Architecture

`src/engine.ts` contains scheduling and form validation functions. `src/storage.ts` exposes the versioned storage contract implemented in `src/state-storage.ts`. `src/export-format.ts` validates portable files, `src/import.worker.ts` parses and validates off the main thread, and `src/DataBackups.tsx` provides previews and recovery controls. `src/App.tsx` coordinates dashboard, entry, history, preferences, and review sessions. Writes persist before successful UI confirmation, and storage failures leave prior UI state intact.

## Verification

Unit tests cover the transition matrix, calendar boundaries, due ordering, metadata-independent sorting, initial-attempt semantics, reclassification, duplicate detection, and malformed storage. Browser workflow and performance verification are documented in `VERIFICATION.md` when executed. No claim of WCAG certification is made; the app uses accessible dialogs, native controls, labels, visible focus, and non-color outcome indicators.
