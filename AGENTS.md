# Deployment & Architecture Guidelines: Gold Swing AI Pro

This repository deploys continuously to Google Cloud Run via GitHub. To ensure zero-downtime deployments and prevent white screen issues after code updates, follow these mandatory guidelines across all future changes.

---

## 1. Monorepo Build Pipeline & Static Assets

The project is structured as an npm monorepo containing:
- Frontend: `@workspace/gold-swing-ai` (Vite + React 19 + Tailwind CSS)
- Backend: `@workspace/api-server` (Node.js + Express + WebSocket + MetaApi)

### Build Sequence
1. **Frontend First**: `npm run build --workspace=@workspace/gold-swing-ai` produces static production assets into `artifacts/gold-swing-ai/dist/public`.
2. **Backend Second**: `npm run build --workspace=@workspace/api-server` bundles the Node server into `artifacts/api-server/dist/index.mjs`.
3. **Asset Distribution**: `node scripts/copy-assets.mjs` copies the compiled frontend assets to:
   - `artifacts/api-server/dist/public`
   - `dist/public`
   - `artifacts/gold-swing-ai/dist/public`

> **Rule**: Never run backend-only builds without building the frontend. Always maintain `"build": "npm run build:frontend && npm run build:backend && node scripts/copy-assets.mjs"` in root `package.json`.

---

## 2. Preventing Post-Deployment White Screens

A white screen typically occurs after GitHub updates due to stale browser cache, missing static paths, or unhandled chunk errors. The following safeguards are permanently in place:

### A. HTTP Caching Headers in `app.ts`
- **`index.html` and `sw.js`**: MUST NEVER be cached. Always served with:
  ```http
  Cache-Control: no-cache, no-store, must-revalidate
  Pragma: no-cache
  Expires: 0
  ```
  This ensures that when Google Cloud deploys a new version from GitHub, the user's browser immediately receives the new HTML with updated bundle hashes rather than looking for old chunks that no longer exist.
- **`/assets/*.js` and `/assets/*.css`**: Have Vite hash fingerprints and are cached with `Cache-Control: public, max-age=31536000, immutable`.

### B. Dynamic Public Path Resolution
`artifacts/api-server/src/app.ts` uses `getPublicPath()`, dynamically checking candidate paths where `index.html` actually exists. Never hardcode single static paths or rely on a single `process.cwd()` assumption.

### C. Client-Side Chunk Reload Handler
`artifacts/gold-swing-ai/index.html` includes:
- `vite:preloadError` listener: Automatically detects when a newly deployed build has invalidated previously cached chunk references and reloads the page with fresh assets.
- Fallback UI: An in-DOM gold spinner inside `<div id="root">` ensures the user never sees a blank white screen before React hydration.

### D. React Component Fallbacks
- In `App.tsx`, `AuthGuard` must NEVER return `null` while loading authentication. It must always render a spinner component.

---

## 3. Google Cloud Run Runtime Settings
- Container port: In production Cloud Run, the `PORT` environment variable is provided (default `8080`).
- Start command: `"start": "node --enable-source-maps ./artifacts/api-server/dist/index.mjs"`.
- Signal handlers: Server listens for `SIGTERM` and `SIGINT` to gracefully drain connections and retry on `EADDRINUSE`.
