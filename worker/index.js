// ============================================================
// 表單 API Worker (Cloudflare Workers + D1) —— 純後端，只提供 API
// 功能：接收落地頁表單 → 存入 D1；提供登入 + 時間範圍查詢 API
// 前端（落地頁 / 後台）通過 fetch 調用以下接口，前後端分離
// ============================================================

const USERNAME = 'da2387';
const PASSWORD = '123456';
const SECRET = 'please-change-this-to-a-long-random-secret-string'; // 建議改成隨機長字串
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // token 7 天有效

// ---- Web Crypto 輔助：HMAC-SHA256 簽名 token ----
async function sign(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return b64url(sig);
}
function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function createToken() {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = await sign('exp=' + exp);
  return exp + '.' + sig;
}
async function verifyToken(token) {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  if (!exp || Date.now() > exp) return false;
  const sig = await sign('exp=' + exp);
  return sig === parts[1];
}

function getBearer(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.indexOf('Bearer ') === 0) return auth.slice(7).trim();
  return null;
}

function json(obj, status, extraHeaders) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(obj), { status, headers });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // 公開：接收表單
    if (url.pathname === '/api/submit' && method === 'POST') {
      return handleSubmit(request, env);
    }
    // 登入：回傳 token
    if (url.pathname === '/api/login' && method === 'POST') {
      return handleLogin(request);
    }
    // 查詢（需帶 Authorization: Bearer <token>）
    if (url.pathname === '/api/submissions' && method === 'GET') {
      return handleSubmissions(request, env, url);
    }

    return new Response('Not Found', { status: 404 });
  },
};

async function handleSubmit(request, env) {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const age = String(body.age || '').trim();
    const height = String(body.height || '').trim();
    const weight = String(body.weight || '').trim();
    const used_product = String(body.used_product || '').trim();

    if (!name || !age || !height || !weight || !used_product) {
      return json({ ok: false, error: '資料不完整' }, 400, CORS);
    }

    await env.DB.prepare(
      'INSERT INTO submissions (name, age, height, weight, used_product, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(name, age, height, weight, used_product, Date.now()).run();

    return json({ ok: true }, 200, CORS);
  } catch (e) {
    return json({ ok: false, error: String((e && e.message) || e) }, 500, CORS);
  }
}

async function handleLogin(request) {
  try {
    const body = await request.json();
    if (body.username === USERNAME && body.password === PASSWORD) {
      const token = await createToken();
      return json({ ok: true, token }, 200, CORS);
    }
    return json({ ok: false, error: '帳號或密碼錯誤' }, 401, CORS);
  } catch (e) {
    return json({ ok: false, error: '格式錯誤' }, 400, CORS);
  }
}

async function handleSubmissions(request, env, url) {
  const token = getBearer(request);
  if (!(await verifyToken(token))) {
    return json({ ok: false, error: '未登入或登入已過期' }, 401, CORS);
  }

  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  let from = parseInt(url.searchParams.get('from'), 10);
  let to = parseInt(url.searchParams.get('to'), 10);
  if (!from || isNaN(from)) from = now - THREE_DAYS;
  if (!to || isNaN(to)) to = now;

  const { results } = await env.DB.prepare(
    'SELECT id, name, age, height, weight, used_product, created_at FROM submissions WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC'
  ).bind(from, to).all();

  return json({ ok: true, from, to, count: results.length, results }, 200, CORS);
}
