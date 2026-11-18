// Identity v2: the authenticate middleware, the guards and the token handler (/session/*).
// The parts with sessions need MongoDB: API_TEST_MONGO_URL=mongodb://127.0.0.1:27017/ npm test
const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const cookieParser = require('cookie-parser');
const express = require('express');
const mongoose = require('mongoose');
const { SignJWT, exportJWK, generateKeyPair } = require('jose');
const {
  requireInternal, requireRole, requireTrustedOrigin, requireUser,
} = require('../middlewares/authenticate');
const { safeReturn } = require('../routes/session');
const { createTokenCrypto } = require('../services/oidc/tokenCrypto');
const { createIdentityV2 } = require('../services/oidc/setup');

const url = process.env.API_TEST_MONGO_URL;
const KEY = Buffer.alloc(32, 7).toString('base64');
const API = 'https://api.example';
const SUB = '64f1c2a0b1c2d3e4f5a6b7c8';

// ---- A fake identity provider ----
let idpServer;
let issuer;
let signingKey;
const codes = new Map();
const validRefresh = new Set();
const revoked = [];
let refreshCalls = 0;
let nextRoles = ['admin'];

const sign = (claims, { typ, audience = 'web', expiresIn = '5m' } = {}) => new SignJWT(claims)
  .setProtectedHeader({ alg: 'ES256', kid: 'k1', ...(typ ? { typ } : {}) })
  .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiresIn)
  .sign(signingKey.privateKey);

const readForm = async (req) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  return new URLSearchParams(body);
};

const startIdp = async () => {
  signingKey = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(signingKey.publicKey)), kid: 'k1', alg: 'ES256' };
  idpServer = http.createServer(async (req, res) => {
    const json = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.url === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/auth`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        revocation_endpoint: `${issuer}/token/revocation`,
        end_session_endpoint: `${issuer}/session/end`,
      });
    }
    if (req.url === '/jwks') return json(200, { keys: [jwk] });
    const form = await readForm(req);
    if (req.url === '/token/revocation') {
      revoked.push(form.get('token'));
      return json(200, {});
    }
    if (form.get('grant_type') === 'authorization_code') {
      const entry = codes.get(form.get('code'));
      if (!entry) return json(400, { error: 'invalid_grant' });
      validRefresh.add('rt-0');
      return json(200, { id_token: await sign({ ...entry.claims, nonce: entry.nonce }), refresh_token: 'rt-0' });
    }
    if (form.get('grant_type') === 'refresh_token') {
      refreshCalls += 1;
      const old = form.get('refresh_token');
      if (!validRefresh.has(old)) return json(400, { error: 'invalid_grant' });
      validRefresh.delete(old);
      const next = `rt-${refreshCalls}`;
      validRefresh.add(next);
      return json(200, { id_token: await sign({ sub: SUB, name: '小明', roles: nextRoles }), refresh_token: next });
    }
    return json(400, { error: 'unsupported' });
  });
  await new Promise((resolve) => { idpServer.listen(0, '127.0.0.1', resolve); });
  issuer = `http://127.0.0.1:${idpServer.address().port}`;
};

// ---- The API under test ----
let apiServer;
let base;

before(async () => {
  await startIdp();
  if (url) {
    await mongoose.connect(url, { dbName: 'api_test_identity_v2' });
    await mongoose.connection.dropDatabase();
  }
  const v2 = createIdentityV2({
    OIDC_ISSUER: issuer, API_RESOURCE: API, OIDC_CLIENT_WEB_SECRET: 'w'.repeat(32), SESSION_TOKEN_KEY: KEY, WEB_APPS_ENV: 'development',
  });
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(v2.authenticate);
  app.use('/session/', v2.sessionRouter);
  const ok = (req, res) => res.json({ sub: req.auth.sub, via: req.auth.via });
  app.get('/web-only', requireUser(), ok);
  app.get('/studio', requireUser({ scope: 'studio' }), ok);
  app.get('/admin', requireRole('admin'), ok);
  app.post('/internal', requireInternal('accounts.erase'), ok);
  app.post('/change', requireTrustedOrigin(['http://localhost:5173']), requireUser(), ok);
  apiServer = http.createServer(app);
  await new Promise((resolve) => { apiServer.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${apiServer.address().port}`;
});

after(async () => {
  apiServer?.close();
  idpServer?.close();
  if (url) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const call = (path, { token, cookie, method = 'GET', headers = {} } = {}) => fetch(`${base}${path}`, {
  method,
  redirect: 'manual',
  headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { cookie } : {}),
    ...headers,
  },
});

const accessToken = (claims, audience = API) => sign({
  sub: SUB, client_id: 'studio', scope: 'studio', roles: ['admin'], ...claims,
}, { typ: 'at+jwt', audience });

// ---- Always ----

test('refresh tokens are encrypted and cannot be altered', () => {
  const box = createTokenCrypto(KEY);
  const sealed = box.encrypt('refresh-token-value');
  assert.doesNotMatch(sealed, /refresh-token-value/);
  assert.equal(box.decrypt(sealed), 'refresh-token-value');
  const [iv, tag, data] = sealed.split('.');
  assert.throws(() => box.decrypt([iv, tag, `${data.slice(0, -2)}AA`].join('.')));
  assert.throws(() => createTokenCrypto('short'), /32 bytes/);
});

test('return paths stay on the same site', () => {
  assert.equal(safeReturn('/history?x=1'), '/history?x=1');
  ['//evil.com', '/\\evil.com', 'https://evil.com', '', undefined, `/${'a'.repeat(600)}`].forEach((value) => {
    assert.equal(safeReturn(value), '/');
  });
});

test('identity v2 stays off without OIDC_ISSUER and refuses a half setup', () => {
  assert.equal(createIdentityV2({}), null);
  assert.throws(() => createIdentityV2({ OIDC_ISSUER: 'https://auth.example' }), /API_RESOURCE/);
});

test('a valid access token for this API reaches routes that name its scope', async () => {
  const res = await call('/studio', { token: await accessToken() });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sub: SUB, via: 'bearer' });
  assert.equal((await call('/admin', { token: await accessToken() })).status, 403);
});

test('app tokens cannot reach web-only routes; wrong audience, type or signature is refused', async () => {
  assert.deepEqual(await (await call('/web-only', { token: await accessToken() })).json(), { error: 'insufficient_scope' });
  assert.equal((await call('/studio', { token: await accessToken({ scope: 'other' }) })).status, 403);
  const wrongAudience = await call('/studio', { token: await accessToken({}, 'https://other.example') });
  assert.equal(wrongAudience.status, 401);
  assert.match(wrongAudience.headers.get('www-authenticate'), /invalid_token/);
  const idToken = await sign({ sub: SUB, scope: 'studio' }, { audience: API });
  assert.equal((await call('/studio', { token: idToken })).status, 401);
  assert.equal((await call('/studio', { token: 'not.a.jwt' })).status, 401);
  assert.equal((await call('/studio')).status, 401);
});

test('only the provider\'s internal token reaches internal routes', async () => {
  const internal = await sign({
    sub: 'idp-internal', client_id: 'idp-internal', scope: 'accounts.erase',
  }, { typ: 'at+jwt', audience: API });
  assert.equal((await call('/internal', { method: 'POST', token: internal })).status, 200);
  assert.equal((await call('/internal', { method: 'POST', token: await accessToken({ scope: 'accounts.erase' }) })).status, 403);
  assert.equal((await call('/studio', { token: await sign({ client_id: 'idp-internal', scope: 'studio' }, { typ: 'at+jwt', audience: API }) })).status, 403);
});

// ---- With MongoDB ----

/** Starts a sign-in for an app, lets the fake provider approve it, and returns the cookies. */
const signIn = async (app = 'bp', claims = {}, returnTo = '/history') => {
  const start = await call(`/session/login?app=${app}&return=${encodeURIComponent(returnTo)}`);
  assert.equal(start.status, 302);
  const auth = new URL(start.headers.get('location'));
  const loginCookie = start.headers.getSetCookie()[0].split(';')[0];
  const code = `code-${Math.random()}`;
  codes.set(code, {
    nonce: auth.searchParams.get('nonce'),
    claims: {
      sub: SUB, sid: 'idp-sid-1', name: '小明', email: 'm@example.com', roles: ['admin'], ...claims,
    },
  });
  const back = await call(`/session/callback?${new URLSearchParams({ code, state: auth.searchParams.get('state'), iss: issuer })}`, { cookie: loginCookie });
  return { auth, back, cookie: back.headers.getSetCookie().find((c) => c.startsWith('6y_sid='))?.split(';')[0] };
};

test('sign-in: PKCE and consent at the provider, then back to the site with a session cookie', { skip: !url }, async () => {
  const { auth, back, cookie } = await signIn('bp');
  assert.equal(auth.origin, issuer);
  assert.equal(auth.searchParams.get('client_id'), 'web');
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://localhost:3001/session/callback');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('prompt'), 'consent');
  assert.match(auth.searchParams.get('state'), /^bp\./);
  assert.equal(back.status, 302);
  assert.equal(back.headers.get('location'), 'http://localhost:5173/history');
  assert.match(back.headers.getSetCookie().find((c) => c.startsWith('6y_sid=')), /HttpOnly/i);

  const me = await (await call('/session/me', { cookie })).json();
  assert.deepEqual(me, {
    sub: SUB, name: '小明', email: 'm@example.com', picture: null, roles: ['admin'], accountUrl: `${issuer}/account`,
  });
  assert.deepEqual(await (await call('/admin', { cookie })).json(), { sub: SUB, via: 'session' });

  const profile = await mongoose.connection.collection('user_profiles').findOne({ _id: new mongoose.Types.ObjectId(SUB) });
  assert.equal(profile.balance, 30);
  assert.equal(profile.display.email, 'm@example.com');
  const stored = await mongoose.connection.collection('web_sessions').findOne({ sub: SUB });
  assert.doesNotMatch(stored.refreshToken, /rt-0/);
});

test('the main site signs in through its own proxy address', { skip: !url }, async () => {
  const { auth, back } = await signIn('main', {}, '/admin/');
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://localhost:3000/api/session/callback');
  assert.equal(back.headers.get('location'), 'http://localhost:3000/admin/');
});

test('broken sign-ins go back to the site with a reason', { skip: !url }, async () => {
  assert.equal((await call('/session/login?app=evil')).status, 400);
  const start = await call('/session/login?app=bp');
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const loginCookie = start.headers.getSetCookie()[0].split(';')[0];
  const noCookie = await call(`/session/callback?state=${state}&code=x`);
  assert.equal(noCookie.headers.get('location'), 'http://localhost:5173/?login_error=expired');
  const cancelled = await call(`/session/callback?state=${state}&error=access_denied`, { cookie: loginCookie });
  assert.equal(cancelled.headers.get('location'), 'http://localhost:5173/?login_error=cancelled');
  // The state was used up by the cancelled attempt
  const again = await call(`/session/callback?state=${state}&code=x`, { cookie: loginCookie });
  assert.equal(again.headers.get('location'), 'http://localhost:5173/?login_error=expired');
});

test('cookie sessions need the site origin and X-Requested-With to change data', { skip: !url }, async () => {
  const { cookie } = await signIn('bp');
  assert.equal((await call('/change', { method: 'POST', cookie })).status, 403);
  assert.equal((await call('/change', { method: 'POST', cookie, headers: { origin: 'https://evil.example', 'x-requested-with': '6yuwei' } })).status, 403);
  assert.equal((await call('/change', { method: 'POST', cookie, headers: { origin: 'http://localhost:5173', 'x-requested-with': '6yuwei' } })).status, 200);
});

test('every ten minutes the session is confirmed once; roles follow the provider', { skip: !url }, async () => {
  const { cookie } = await signIn('bp');
  await mongoose.connection.collection('web_sessions').updateMany({}, { $set: { checkedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  nextRoles = [];
  const callsBefore = refreshCalls;
  const answers = await Promise.all([1, 2, 3].map(() => call('/session/me', { cookie }).then((r) => r.json())));
  assert.equal(refreshCalls - callsBefore, 1);
  assert.ok(answers.every((a) => a.sub === SUB));
  assert.deepEqual((await (await call('/session/me', { cookie })).json()).roles, []);
  assert.equal((await call('/admin', { cookie })).status, 403);
  nextRoles = ['admin'];
});

test('a session the provider no longer accepts ends', { skip: !url }, async () => {
  const { cookie } = await signIn('bp');
  validRefresh.clear();
  await mongoose.connection.collection('web_sessions').updateMany({}, { $set: { checkedAt: new Date(Date.now() - 11 * 60 * 1000) } });
  const res = await call('/session/me', { cookie });
  assert.equal(res.status, 401);
  assert.match(res.headers.getSetCookie().join(), /6y_sid=;/);
});

test('logout needs the site origin, revokes the refresh token and returns the provider sign-out URL', { skip: !url }, async () => {
  const { cookie } = await signIn('bp');
  assert.equal((await call('/session/logout', { method: 'POST', cookie })).status, 403);
  const res = await call('/session/logout', { method: 'POST', cookie, headers: { origin: 'http://localhost:5173', 'x-requested-with': '6yuwei' } });
  assert.equal(res.status, 200);
  const { logoutUrl } = await res.json();
  const out = new URL(logoutUrl);
  assert.equal(`${out.origin}${out.pathname}`, `${issuer}/session/end`);
  assert.equal(out.searchParams.get('post_logout_redirect_uri'), 'http://localhost:5173/');
  assert.ok(revoked.includes('rt-0'));
  assert.equal((await call('/session/me', { cookie })).status, 401);
});

test('back-channel logout ends the named session and refuses forged notices', { skip: !url }, async () => {
  const { cookie } = await signIn('bp', { sid: 'idp-sid-bc' });
  const forged = await fetch(`${base}/session/backchannel-logout`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'logout_token=forged',
  });
  assert.equal(forged.status, 400);
  const logoutToken = await sign({ sub: SUB, sid: 'idp-sid-bc', events: { 'http://schemas.openid.net/event/backchannel-logout': {} } }, { audience: 'web' });
  const ok = await fetch(`${base}/session/backchannel-logout`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `logout_token=${logoutToken}`,
  });
  assert.equal(ok.status, 200);
  assert.equal((await call('/session/me', { cookie })).status, 401);
});
