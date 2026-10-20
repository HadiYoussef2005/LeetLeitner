# Phase 1 verification

## Link/number entry and notebook redesign — October 20, 2026

New problems default to one link/number field, followed by an automatically populated metadata preview and the attempt outcome. Manual entry is a fallback. The visual theme now uses IBM Plex type, graphite surfaces, amber accents, a three-card mark, restrained borders, denser problem cards, and factual status copy.

- `npm test`: 113 tests pass, including URL normalization, displayed-number resolution, metadata validation, cache expiry/single-flight sharing, upstream response bounds, bad responses, timeouts, client cancellation, credential omission, and hosted base paths.
- `npm run build`: TypeScript and the production bundle pass, including server/function source type checks.
- `npm run test:link-input`: real LeetCode GET lookups for a number and a full description link return 200 through the app endpoint. Browser checks cover automatic metadata, both entry styles, selected outcome scheduling, duplicate detection without a request, stale-response cancellation, failed/not-found lookups, manual fallback with prefilled values, cancellation without saving, responsive layout, reload persistence, and offline manual saving. Axe reports zero A/AA violations in the new form.
- The existing review, data-portability, and browser-restart checks pass with the notebook interface and explicit manual-entry fallback.
- Populated desktop and mobile views and the metadata dialog were visually inspected. Screenshots and the focused browser report are in ignored `.test-results/`.
- The final 1,000-problem sort benchmark passes at 72.2 ms p95 across 30 browser updates (87.2 ms maximum), below the existing 100 ms target.

The deployed API entry is `api/problem.ts`; it exports a Vercel Web Standard fetch handler, and the `.json` subpath rewrite retains compatibility with the existing portfolio proxy. Vite dev/preview use the same handler. Live LeetCode GETs were verified locally; deploying this feature to Vercel is separate from committing the branch.

Only the public problem reference is sent to the read-only service. Review records, histories, settings, and backups remain local. Metadata lookup needs internet access and uses LeetCode's currently available endpoints; upstream denial or schema changes produce a recoverable error rather than guessed records. There is no authenticated LeetCode integration or submission tracking.

## Data portability feature verification — October 12, 2026

The export/import/restore ticket is implemented under **Preferences → Data & Backups**. Production build and 57 unit tests pass (19 scheduling tests plus 38 portability/storage tests). The existing daily-review browser suite also passes with the new storage envelope.

| Ticket requirement                                | Evidence                                                                                                                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete UTF-8 `.txt` export and backup download  | Actual browser downloads parsed and compared field-for-field with persisted state; Unicode and literal HTML text retained                                                                                                                     |
| Latest persisted state, read-only export          | Export from a stale tab matched the current persisted state without writing; read-only legacy export tested separately                                                                                                                        |
| Full file validation before mutation              | Invalid JSON, versions, duplicate IDs/numbers, invalid dates/timestamps/URLs/tags/time zones, history transitions/outcomes, intervals, sorting, and enum coercion rejected in unit tests; malformed and oversized uploads rejected in browser |
| 10 MiB cap and background parsing                 | UTF-8 byte limits tested; production worker validates actual uploads, including a 4 MiB file; worker is included in offline asset cache                                                                                                       |
| Replacement preview and explicit confirmation     | Browser preview shows export time, problem and event counts, per-bucket counts/intervals, and current replacement count; read-only preview and cancellation verified                                                                          |
| Exact replacement without merging or rescheduling | Browser state comparison preserves IDs, metadata, history, due dates, timestamps, and settings; empty import also verified                                                                                                                    |
| One automatic backup and overwrite disclosure     | Unit test confirms one atomic storage write contains both states; browser verifies backup contents, warning, and download before overwriting                                                                                                  |
| Reversible restore                                | Browser and unit tests swap active state and backup, then reverse the restore                                                                                                                                                                 |
| Safe migration and quota failures                 | Legacy state migrates without loss; failed migration preserves original bytes; failed import/restore preserve both states; serialization failure writes nothing                                                                               |
| Repeated confirmation and pending cancellation    | Browser double-click commits once; closing a pending confirmation prevents the write                                                                                                                                                          |
| Transient UI reset                                | Source resets sessions, selected problems, filters, pagination, dialogs, and view; browser verifies dialog dismissal, cleared filters, refreshed counts, and imported sorting                                                                 |
| Concurrent changes invalidate preview             | Real second-tab writes and `localStorage.clear()` remove the preview and lock actions; expected raw storage is also checked immediately before committing                                                                                     |
| Reload/restart durability                         | Separate persistent-profile browser restart verified both the imported empty collection and the previous backup; backup restored successfully after restart                                                                                   |
| Offline operation                                 | Browser networking disabled: worker validation, import, active export, backup download, restore, and reload all succeed                                                                                                                       |
| Accessible/responsive controls                    | Axe A/AA scan of import preview reports zero violations; Escape dismissal and 390px mobile overflow check pass; desktop/mobile preview screenshots inspected                                                                                  |

Reproduce with `npm run build`, `npm run preview -- --port 4173`, then `npm test`, `npm run test:portability`, `npm run test:browser`, and `npm run test:restart`. Browser verification requires installed Microsoft Edge. Reports are in ignored `.test-results/portability-report.json` and `.test-results/restart.json`.

Existing 1,000-problem sort benchmark passes in isolation at **80.1 ms p95** (30 samples, 85.2 ms maximum) on the reference system documented below. A concurrent run suffered host scheduling stalls and failed; the isolated rerun is the reported benchmark. Bulk imports are intentionally a separate busy-state operation, not subject to routine-interaction latency promises.

Only one local backup is retained. Browser site-data deletion removes it; an exported file is necessary for recovery after deletion. Files never leave the device. No cloud backup, partial import, or merge was added.

Verified October 12, 2026. This implements the Phase 1 BRD in the current workspace.

## Requirements and evidence

| Requirement                                         | Implementation                                                    | Evidence                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Local-first, no accounts/backend/scraping           | React app with browser LocalStorage; external LeetCode links only | Production browser workflows; storage contents inspected                                            |
| Manual entry, validation, duplicate detection       | Problem editor and `validateInput`                                | Unit tests; three real form submissions; duplicate navigation                                       |
| Three buckets and 2/4/10-day defaults               | `engine.ts` and preferences                                       | All nine transition combinations tested; preferences workflow                                       |
| Failure always demotes to Bucket 1                  | Outcome-based scheduling                                          | Unit matrix and browser failure from Buckets 2 and 3                                                |
| Configurable intervals within requested ranges      | Constrained preferences selectors                                 | Settings validation tests and browser preference update                                             |
| Calendar-based due dates                            | Date-only due dates, UTC event timestamps                         | Month/year/leap-day and daylight-saving calendar boundary tests                                     |
| Due and overdue queue                               | Ordered by date, bucket, problem number                           | Unit ordering test; overdue fixture used for daily review workflow                                  |
| Daily sessions, skip, early review, session summary | Session dialog                                                    | Browser outcome, skip, early review, and completion checks                                          |
| Custom bucket sorting and filters                   | Persisted per-bucket sort; search and difficulty controls         | Sorting persistence and search checked in browser                                                   |
| Editing preserves schedule/history                  | Metadata-only update                                              | Browser comparison of before/after schedule and history                                             |
| Manual corrections and deletion                     | Correction history; confirmed deletion                            | Browser timestamp preservation and delete/cancel workflows                                          |
| Persistence after reload/restart                    | Versioned LocalStorage repository                                 | Browser reload and separate persistent-profile browser restart tests                                |
| Safe storage failures and malformed data            | Save-before-confirm, visible error, write lock, recovery download | Quota error simulation and malformed data preservation checked in browser                           |
| Offline after first cached load                     | Generated production service worker                               | Browser networking disabled; reload retained functional UI and stored records                       |
| Responsive dark dashboard                           | Custom CSS with mobile breakpoints                                | 1440px desktop and 390px mobile screenshots visually inspected; no mobile horizontal overflow       |
| Accessibility                                       | Native modal dialog, labels, focus states, semantic controls      | Axe WCAG A/AA checks found zero violations on dashboard and problem dialog; Escape dismisses dialog |
| Updates below 100 ms with 1,000 records             | Paginated buckets and queue, 24 per page                          | 30 browser sort mutations: final p95 67.3 ms, max 68 ms                                             |
| Production build and dependency health              | TypeScript + Vite                                                 | Build succeeds; 19 unit tests pass; npm audit reports zero vulnerabilities                          |

## Reproduce

```sh
npm install
npm test
npm run build
npm run preview -- --port 4173
```

With the preview running in another terminal:

```sh
npm run test:browser
npm run test:performance
npm run test:restart
```

Browser scripts use a locally installed Microsoft Edge and isolated test contexts. Reports and screenshots are written to ignored `.test-results/`. The restart test uses an isolated persistent profile inside that directory. Automated tests never modify the user's normal browser profile.

Performance reference: Windows ARM64, Qualcomm ARMv8 Family 8 Model 1 Revision 201; Node 22.12.0; Edge 155.0.4283.45; 1440×1000 viewport. Timing covers the change event, persistence, React update, and two animation frames. The fixture contains 1,000 problems with empty attempt histories. This is a bounded benchmark rather than a guarantee on every device or arbitrarily large histories.

## Operational limits

- LocalStorage is intentionally used, as permitted by the BRD. Browser quotas and clearing site data affect persistence.
- Core offline functionality is available in production after successful service-worker installation; first-ever offline visits cannot load the app.
- State schema version 1 remains supported. Original flat storage is migrated to storage envelope version 2, preserving data and adding a nullable backup. Export file version 1 is independently validated. Unsupported versions are preserved and rejected safely.
- One active editing tab is supported. External storage changes lock writes until reload.
- Accessibility automation and keyboard/visual checks passed; this is not a formal independent WCAG certification.
- No cloud syncing, authentication, direct LeetCode API integration, or judge is included in Phase 1.
