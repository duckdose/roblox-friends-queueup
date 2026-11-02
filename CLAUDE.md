# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Commands

- `npm install` — install Wrangler for local Worker development/deploys.
- `npm run check` — syntax-check the frontend and Worker JavaScript.
- `npm run dev` — run the Cloudflare Worker locally on port 8788.
- `npm run deploy:api` — deploy the Worker (requires Wrangler login, D1 setup, and configured secrets).
- `npx wrangler d1 execute robux-friends-queue --local --file=worker/schema.sql` — initialize local D1 schema.
- `npx wrangler d1 execute robux-friends-queue --remote --file=worker/schema.sql` — initialize remote D1 schema.

There is no lint or test suite configured yet. For a syntax check of one file, run `node --check app.js` or `node --check worker/src/index.js`.

## Architecture

The browser client is a static site (`index.html`, `styles.css`, `app.js`) intended for GitHub Pages. It calls the separate Cloudflare Worker API; set the API origin in the `API_BASE` constant at the top of `app.js` when changing environments. Browser access uses the shared invite code, while admin mutations use an expiring session token issued by the Worker after password login. Do not put these credentials in static assets.

`worker/src/index.js` owns API validation, invite-code checks, D1 queries, 30-day expiry cleanup, and admin session checks. `worker/schema.sql` defines request and session storage; `worker/wrangler.toml` binds D1 and configures exact allowed CORS origins. The public board reads only requests that pass the invite-code gate; admin-only routes update status and delete records. Setup and deployment details are in `README.md`.
