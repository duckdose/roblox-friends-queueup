# Robux Friends Queue

A small static frontend for GitHub Pages and a Cloudflare Worker + D1 API. The board is invite-code gated and displays Roblox usernames, request dates, and statuses. Admins can update status or delete requests. Requests are deleted one calendar month after submission. The app does not read or store visitor IP addresses.

## Local development

Requirements: Node.js 22+ and npm (the locked Wrangler version requires Node.js 22 or newer).

```sh
npm install
npm run check
npm run dev
```

The Worker runs at `http://localhost:8788`. Set local secrets in `worker/.dev.vars` (ignored by git):

```dotenv
INVITE_CODE=choose-a-local-invite-code
ADMIN_PASSWORD=choose-a-local-admin-password
```

Initialize a local D1 database before using the API:

```sh
npx wrangler d1 execute robux-friends-queue --local --file=worker/schema.sql --config worker/wrangler.toml
```

Open the site through a static server at `http://localhost:8788` only if Worker static assets are configured; otherwise use a local static server on another port, then add its exact origin to `ALLOWED_ORIGINS` in `worker/wrangler.toml`. The Worker API is on port 8788, so for a straightforward split local setup run the frontend on port 5500 and add `http://127.0.0.1:5500` and/or `http://localhost:5500` to allowed origins. Set `API_BASE` at the top of `app.js` to `http://localhost:8788` while developing locally.

## Cloudflare API setup

1. Install dependencies and authenticate: `npm install`, then `npx wrangler login`.
2. The configured D1 database is already provisioned and its ID is in `worker/wrangler.toml`. If setting up a separate Cloudflare account, create a new D1 database with `npx wrangler d1 create robux-friends-queue --config worker/wrangler.toml`, then replace the configured `database_id` with the newly returned ID.
3. Initialize the remote schema: `npx wrangler d1 execute robux-friends-queue --remote --file=worker/schema.sql --config worker/wrangler.toml`.
4. Set `ALLOWED_ORIGINS` in `worker/wrangler.toml` to the exact browser origins, without paths or trailing slashes. For GitHub Pages use `https://your-user.github.io` even when the site URL has a repository path such as `/your-repo`. Include the exact local frontend origins if needed.
5. Set secrets: `npx wrangler secret put INVITE_CODE --config worker/wrangler.toml` and `npx wrangler secret put ADMIN_PASSWORD --config worker/wrangler.toml`. Use distinct, long values and share the invite code only with friends.
6. Deploy the API: `npm run deploy:api`. Set `API_BASE` in `app.js` to the deployed Worker URL.
7. Enable GitHub Pages for the repository, using the main branch and `/ (root)` as the publishing source. Push the static files (`index.html`, `styles.css`, and `app.js`) to that branch.

The GitHub Pages site can be public even though the board API requires the invite code. The invite code is a shared gate, not individual identity verification, and can be forwarded. Anyone who has it can view the board and submit a request. Admin password and invite code are checked by the Worker; do not put them in frontend files.

## Project layout

- `index.html`, `styles.css`, and `app.js` are the static browser application and can be served by GitHub Pages.
- `worker/src/index.js` is the API: it checks the invite code, manages requests, expires records, and protects admin endpoints with password-issued expiring sessions.
- `worker/schema.sql` defines the D1 request and admin-session tables.
- `worker/wrangler.toml` configures the Worker, D1 binding, and allowed browser origins.
