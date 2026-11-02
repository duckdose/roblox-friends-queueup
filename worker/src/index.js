const STATUSES = new Set(['pending', 'accepted', 'rejected', 'fulfilled']);
const SESSION_TTL = 8 * 60 * 60;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function response(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Invite-Code, Authorization', 'Vary': 'Origin' },
  });
}

function jsonError(message, status, origin) { return response({ error: message }, status, origin); }

function getOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : '';
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tokenValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function requireAdmin(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const hash = await sha256(token);
  const session = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').bind(hash).first();
  if (!session || session.expires_at <= Math.floor(Date.now() / 1000)) {
    if (session) await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').bind(hash).run();
    return false;
  }
  return true;
}

async function cleanupExpired(env) {
  const cutoff = new Date(Date.now() - MONTH_MS).toISOString();
  await env.DB.prepare('DELETE FROM requests WHERE created_at <= ?').bind(cutoff).run();
}

async function route(request, env, origin) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Invite-Code, Authorization', 'Vary': 'Origin' } });
  if (!origin) return jsonError('Origin not allowed.', 403, 'null');

  if (path === '/api/health' && request.method === 'GET') return response({ ok: true }, 200, origin);

  if (path.startsWith('/api/')) {
    const suppliedCode = request.headers.get('X-Invite-Code') || '';
    if (!env.INVITE_CODE || suppliedCode !== env.INVITE_CODE) return jsonError('Invalid invite code.', 403, origin);
  }

  if (path === '/api/requests' && request.method === 'GET') {
    await cleanupExpired(env);
    const result = await env.DB.prepare('SELECT id, username, status, created_at FROM requests ORDER BY created_at ASC').all();
    return response(result.results, 200, origin);
  }

  if (path === '/api/requests' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return jsonError('Enter a valid Roblox username (3–20 letters, numbers, or underscores).', 400, origin);
    await cleanupExpired(env);
    const createdAt = new Date().toISOString();
    try {
      await env.DB.prepare('INSERT INTO requests (username, status, created_at) VALUES (?, ?, ?)').bind(username, 'pending', createdAt).run();
    } catch {
      return jsonError('A request with that username already exists.', 409, origin);
    }
    return response({ ok: true }, 201, origin);
  }

  if (path === '/api/admin/login' && request.method === 'POST') {
    const body = await request.json().catch(() => null);
    if (!env.ADMIN_PASSWORD || typeof body?.password !== 'string' || body.password !== env.ADMIN_PASSWORD) return jsonError('Incorrect password.', 401, origin);
    const token = tokenValue();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)').bind(await sha256(token), expiresAt).run();
    return response({ token, expires_at: expiresAt }, 200, origin);
  }

  if (path === '/api/admin/requests' && request.method === 'GET') {
    if (!await requireAdmin(request, env)) return jsonError('Admin session expired. Sign in again.', 401, origin);
    await cleanupExpired(env);
    const result = await env.DB.prepare('SELECT id, username, status, created_at FROM requests ORDER BY created_at ASC').all();
    return response(result.results, 200, origin);
  }

  const requestMatch = path.match(/^\/api\/admin\/requests\/([1-9][0-9]*)$/);
  if (requestMatch && ['PATCH', 'DELETE'].includes(request.method)) {
    if (!await requireAdmin(request, env)) return jsonError('Admin session expired. Sign in again.', 401, origin);
    const id = Number(requestMatch[1]);
    if (request.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(id).run();
      return response({ ok: true }, 200, origin);
    }
    const body = await request.json().catch(() => null);
    if (!STATUSES.has(body?.status)) return jsonError('Invalid status.', 400, origin);
    const result = await env.DB.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(body.status, id).run();
    if (!result.meta.changes) return jsonError('Request not found.', 404, origin);
    return response({ ok: true }, 200, origin);
  }

  return jsonError('Not found.', 404, origin);
}

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);
    try {
      return await route(request, env, origin);
    } catch (error) {
      console.error('Queue API error:', error instanceof Error ? error.message : 'Unknown error');
      return jsonError('The queue service encountered an error.', 500, origin || 'null');
    }
  },
};
