# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node.js 22+ and npm. Install dependencies with `npm install`.

- `npm run check` — syntax-checks `app.js` and `worker/src/index.js`.
- `node --check app.js` or `node --check worker/src/index.js` — syntax-check one JavaScript file.
- `npm run dev` — run the local Cloudflare Worker at `http://localhost:8788`.
- `npx wrangler d1 execute robux-friends-queue --local --file=worker/schema.sql --config worker/wrangler.toml` — initialize local D1 schema.
- `npm run deploy:api` — deploy the Worker (requires Wrangler authentication, D1 setup, and configured secrets).

There is no configured lint command or test suite. Local secrets belong in the ignored `worker/.dev.vars`; the frontend's local API origin is set by `API_BASE` in `app.js`. For split frontend/API development, use a static server and add its exact origin to `ALLOWED_ORIGINS` in `worker/wrangler.toml`.

## Architecture

The project separates a static browser app from its API. `index.html`, `styles.css`, and `app.js` are published from the repository root via GitHub Pages; the frontend calls a separately deployed Cloudflare Worker. `worker/src/index.js` handles API routing, exact-origin CORS validation, invite-code checks for `/api/*`, request validation and D1 operations, expiry cleanup, and admin authentication. Admin login issues an eight-hour token; only its hash is stored in D1, and admin request mutations require that session. `worker/schema.sql` defines request and session tables, while `worker/wrangler.toml` binds D1 and configures allowed origins.

The board's read and submit endpoints require the shared invite code; admin routes additionally require an admin session where appropriate. Requests are cleaned up after one calendar month. Deployment setup, environment configuration, and GitHub Pages publishing are documented in `README.md`.