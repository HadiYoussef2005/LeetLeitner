# Deploy at hyoussef.tech/leetleitner

This repository is prepared for `/leetleitner/`. The portfolio remains the Vercel project owning `hyoussef.tech`; LeetLeitner is a separate static Vercel project. The portfolio's Next.js configuration proxies only `/leetleitner/*` to that project.

## 1. Deploy the application

Push this repository and import it into Vercel as a new project. The committed `vercel.json` supplies:

- Build command: `npm run build`.
- Output directory: `dist`.
- Framework override: `null` (static files with an explicit build command).
- `/` redirects to `/leetleitner/`; Vercel's `trailingSlash: true` canonicalizes `/leetleitner` to `/leetleitner/` without changing asset file URLs.
- Service worker and entry HTML are revalidated; content-hashed assets can be cached long term.

Use the project's stable production URL, such as `https://YOUR-APP-PROJECT.vercel.app`. Verify its `/leetleitner/` page before connecting your domain. If production Deployment Protection is enabled, the upstream files must be accessible to visitors and the proxy without an authentication page.

Do **not** move `hyoussef.tech` to the app project. Keep it assigned to the portfolio.

## 2. Connect the portfolio

The actual portfolio at `C:/Work/hadi_portfolio` has been prepared with a `next.config.ts` rewrite controlled by **`LEETLEITNER_ORIGIN`**.

On the **portfolio** Vercel project, add:

```text
LEETLEITNER_ORIGIN=https://YOUR-APP-PROJECT.vercel.app
```

Set it for Production, and Preview if desired. Use a bare origin without `/leetleitner`, a query string, or credentials. Push the portfolio changes and redeploy after setting the variable: Next.js generates its rewrite routes at build time.

The portfolio's `/leetleitner` URL redirects to `/leetleitner/`. That prefix is preserved when forwarding requests upstream, including JavaScript, CSS, icons, the import worker, and `sw.js`. The normal homepage, contact API, and Next.js assets remain served by the portfolio.

The portfolio's `src/proxy.ts` handles the canonical entry redirect with an exact pathname check. `next.config.ts` serves the entry through an explicit `/leetleitner/index.html` rewrite and forwards assets under the same prefix. No portfolio `vercel.json` is needed. All example deployment domains in this guide are placeholders.

## 3. Local verification

```sh
npm run build
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173/leetleitner/`. Existing browser scripts use this subpath by default.

In the portfolio directory, PowerShell:

```powershell
$env:LEETLEITNER_ORIGIN = 'http://127.0.0.1:4173'
npm run dev -- --port 4174
```

Open `http://localhost:4174/` and `http://localhost:4174/leetleitner/`. The app's service-worker scope must end in `/leetleitner/`, and the portfolio homepage must not be controlled by that worker.

## Build and storage details

### Public metadata lookup

Vercel deploys `api/problem.ts` as a Node.js function. `vercel.json` rewrites `/leetleitner/api/problem.json` to it. The `.json` path avoids trailing-slash redirects, including through the portfolio proxy. The existing portfolio wildcard rewrite forwards this endpoint; no portfolio source changes or new environment variables are needed for this feature.

Vite dev and preview expose the same API locally through `server/vite-metadata.ts`. Do not copy just `dist` to a static-only production host and expect automatic lookups to work: Vercel must deploy the function source alongside the static output. The rest of the app still works with manual entry. The service worker deliberately bypasses `/leetleitner/api/`.

The function only retrieves public metadata using GET requests to fixed LeetCode endpoints. It never stores or receives review history, imports, or backups. Lookup needs internet access and falls back to manual entry on upstream failure. The 25-second function budget covers the bounded catalogue and detail requests. See [Vercel's Node.js function documentation](https://vercel.com/docs/functions/runtimes/node-js).

### Static assets and local state

`hosting.config.json` is the shared base-path definition. Vite writes physical files under `dist/leetleitner/`, and the offline generator uses the same definition. `prebuild` cleans only this repository's generated `dist` folder so earlier root-level bundles cannot accidentally ship.

The service worker caches only app assets, ignores requests outside the app prefix, and cleans only its own path-specific cache namespace. It does not cache or provide an offline fallback for the portfolio.

LocalStorage is **origin-scoped**, not path-scoped. Localhost, a `.vercel.app` address, and `hyoussef.tech` have separate storage. Export from the old address and import at the final address to move progress. Pages on `hyoussef.tech` share that origin's storage; the app keeps its namespaced `leetleitner.v1` key.

## Final hosted checks

- `/leetleitner` reaches the canonical page without redirect loops.
- CSS, JavaScript, favicon, import worker, and service worker return the right file types under `/leetleitner/`.
- A reload preserves progress; import/export and offline reload work.
- `/` still shows the portfolio and `/_next/*` remains available.

Live deployment and DNS changes are not part of these source preparations.

## Verified locally

Both the app's production build and the portfolio's production Next.js build pass. The existing 57 unit tests, review browser suite, and import/export browser suite pass at the new subpath.

`npm run test:hosting` runs against the portfolio server on port 4174 with the app preview on port 4173. It verifies the actual production Next.js proxy: canonical redirect, every app asset's status/type, 36-problem import, offline reload and import worker, unchanged portfolio homepage/contact endpoint, service-worker scope, and preservation of an unrelated portfolio cache. The report is saved to ignored `.test-results/hosting-report.json`. It does not claim a live Vercel deployment.

References: [Vercel external rewrites](https://vercel.com/docs/routing/rewrites), [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites), [Vite public base paths](https://vite.dev/guide/build.html#public-base-path).
