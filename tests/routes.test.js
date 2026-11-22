// The whole app with identity v2: every route's guard (docs/Auth-v2.md §3), the new endpoints,
// and the old sign-in routes being gone. Needs MongoDB:
// API_TEST_MONGO_URL=mongodb://127.0.0.1:27017/ npm test
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const { SignJWT, exportJWK, generateKeyPair } = require('jose');
const fs = require('node:fs/promises');
const os = require('node:os');
const { dirname, join } = require('node:path');
const { buildApp } = require('../buildApp');
const { getAllowedOrigins } = require('../config/origins');
const { createIdentityV2 } = require('../services/oidc/setup');
const { createTokenCrypto } = require('../services/oidc/tokenCrypto');
const { eraseAccount } = require('../services/accountErase');

const url = process.env.API_TEST_MONGO_URL;
const KEY = Buffer.alloc(32, 9).toString('base64');
const API = 'http://localhost:3001';
const ORIGIN = 'http://localhost:5173';
const ADMIN = '64f1c2a0b1c2d3e4f5a6b701';
const USER = '64f1c2a0b1c2d3e4f5a6b702';
const OTHER = '64f1c2a0b1c2d3e4f5a6b703';

let idp;
let issuer;
let signingKey;
let server;
let base;
const cookies = {};

const sign = (claims, audience = API) => new SignJWT(claims)
  .setProtectedHeader({ alg: 'ES256', kid: 'k1', typ: 'at+jwt' })
  .setIssuer(issuer)
  .setAudience(audience)
  .setIssuedAt()
  .setExpirationTime('5m')
  .sign(signingKey.privateKey);

/** A token handler session stored directly, as if the person had just signed in. */
const sessionFor = async (sub, roles) => {
  const sid = crypto.randomBytes(32).toString('base64url');
  const at = new Date();
  await mongoose.connection.collection('web_sessions').insertOne({
    _id: crypto.createHash('sha256').update(sid).digest('hex'),
    sub,
    roles,
    idpSid: `sid-${sub}`,
    refreshToken: createTokenCrypto(KEY).encrypt('rt'),
    app: 'bp',
    display: { name: sub === ADMIN ? '管理員' : '小明', email: `${sub}@example.com` },
    checkedAt: at,
    lastSeenAt: at,
    expiresAt: new Date(Date.now() + 86400000),
  });
  return `6y_sid=${sid}`;
};

before(async () => {
  if (!url) return;
  signingKey = await generateKeyPair('ES256', { extractable: true });
  const jwk = { ...(await exportJWK(signingKey.publicKey)), kid: 'k1', alg: 'ES256' };
  idp = http.createServer((req, res) => {
    if (req.url === '/jwks') return res.end(JSON.stringify({ keys: [jwk] }));
    return res.end(JSON.stringify({
      issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, end_session_endpoint: `${issuer}/session/end`,
    }));
  });
  await new Promise((resolve) => { idp.listen(0, '127.0.0.1', resolve); });
  issuer = `http://127.0.0.1:${idp.address().port}`;

  await mongoose.connect(url, { dbName: 'api_test_routes' });
  await mongoose.connection.dropDatabase();
  const identity = createIdentityV2({
    OIDC_ISSUER: issuer, API_RESOURCE: API, OIDC_CLIENT_WEB_SECRET: 'w'.repeat(32), SESSION_TOKEN_KEY: KEY, WEB_APPS_ENV: 'development',
  });
  server = http.createServer(buildApp({ identity, allowedOrigins: getAllowedOrigins('development') }));
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  cookies.admin = await sessionFor(ADMIN, ['admin']);
  cookies.user = await sessionFor(USER, []);
  const profiles = mongoose.connection.collection('user_profiles');
  await profiles.insertMany([
    {
      _id: new mongoose.Types.ObjectId(USER), balance: 5, favoriteComponents: [], display: { name: '小明', email: 'ming@example.com' },
    },
    {
      _id: new mongoose.Types.ObjectId(OTHER), balance: 0, favoriteComponents: [], display: { name: '小華', email: 'hua@example.com' },
    },
  ]);
});

after(async () => {
  server?.close();
  idp?.close();
  if (url) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

const call = (method, path, { as, token, body } = {}) => fetch(`${base}${path}`, {
  method,
  redirect: 'manual',
  headers: {
    ...(as ? { cookie: cookies[as], origin: ORIGIN, 'x-requested-with': '6yuwei' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'content-type': 'application/json' } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});

const USER_ROUTES = [
  ['GET', '/me/'],
  ['GET', '/components/user/'],
  ['GET', '/components/favorites/'],
  ['GET', '/components/favorites/id/'],
  ['POST', '/components/favorites/'],
  ['DELETE', '/components/favorites/x/'],
  ['DELETE', '/components/64f1c2a0b1c2d3e4f5a6b7ff/'],
  ['POST', '/bp/sync/'],
  ['DELETE', '/bp/data/'],
  ['GET', '/bp/share/'],
  ['POST', '/bp/share/'],
  ['DELETE', '/bp/share/'],
  ['GET', '/studio/save/'],
  ['PUT', '/studio/save/'],
];

const ADMIN_ROUTES = [
  ['GET', '/websites/admin/'],
  ['GET', '/3dcgs/admin/'],
  ['GET', '/animations/admin/'],
  ['GET', '/websites/admin/category/'],
  ['GET', '/contact/admin/'],
  ['POST', '/components/admin/types/'],
  ['POST', '/bp/ocr/'],
  ['GET', '/dict/admin/words/'],
  ['GET', '/admin/profiles/'],
  ['GET', '/test/'],
];

const PUBLIC_ROUTES = [
  ['GET', '/'],
  ['GET', '/websites/'],
  ['GET', '/3dcgs/category/'],
  ['GET', '/components/'],
  ['GET', '/components/types/'],
  ['GET', '/dict/vocabulary/stats'],
];

const GONE = [
  ['POST', '/login/'], ['POST', '/logout/'], ['GET', '/loginStatus/'], ['POST', '/signup/'], ['GET', '/googleLogin/'],
  ['GET', '/bp/google/'], ['POST', '/app/login/'], ['POST', '/app/googleLogin/'], ['POST', '/app/appleLogin/'],
  ['POST', '/app/deleteUser/'], ['GET', '/user/'], ['GET', '/user/balance/'], ['GET', '/account/forgot-password/'],
  ['GET', '/members/'], ['GET', '/guessai_canvas/ranking/'], ['GET', '/admin/uploads/64f1c2a0b1c2d3e4f5a6b702/a.png'],
];

test('signed-in routes refuse visitors', { skip: !url }, async () => {
  await Promise.all([...USER_ROUTES, ...ADMIN_ROUTES].map(async ([method, path]) => {
    const res = await call(method, path);
    assert.equal(res.status, 401, `${method} ${path}`);
  }));
});

test('admin routes refuse ordinary accounts and let admins through', { skip: !url }, async () => {
  await Promise.all(ADMIN_ROUTES.map(async ([method, path]) => {
    const asUser = await call(method, path, { as: 'user' });
    assert.equal(asUser.status, 403, `user ${method} ${path}`);
    const asAdmin = await call(method, path, { as: 'admin' });
    assert.ok(![401, 403].includes(asAdmin.status), `admin ${method} ${path} got ${asAdmin.status}`);
  }));
});

test('public routes need nobody', { skip: !url }, async () => {
  await Promise.all(PUBLIC_ROUTES.map(async ([method, path]) => {
    const res = await call(method, path);
    assert.ok(![401, 403].includes(res.status), `${method} ${path} got ${res.status}`);
  }));
});

test('the old sign-in, members and Guessai routes are gone', { skip: !url }, async () => {
  await Promise.all(GONE.map(async ([method, path]) => {
    const res = await call(method, path, { as: 'admin' });
    assert.equal(res.status, 404, `${method} ${path}`);
  }));
});

test('session changes need the site origin and X-Requested-With', { skip: !url }, async () => {
  const bare = await fetch(`${base}/bp/share/`, { method: 'POST', headers: { cookie: cookies.user } });
  assert.equal(bare.status, 403);
  assert.deepEqual(await bare.json(), { error: 'origin_not_allowed' });
  const foreign = await fetch(`${base}/bp/share/`, { method: 'POST', headers: { cookie: cookies.user, origin: 'https://evil.example', 'x-requested-with': '6yuwei' } });
  assert.equal(foreign.status, 403);
  // A visitor posting the public contact form needs neither
  const contact = await fetch(`${base}/contact/`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.notEqual(contact.status, 403);
});

test('Nihongo Studio tokens reach the save and the dictionary editor, not the web features', { skip: !url }, async () => {
  const studio = await sign({
    sub: USER, client_id: 'studio', scope: 'studio', roles: [],
  });
  const put = await call('PUT', '/studio/save/', { token: studio, body: { revision: 0, data: { days: {} } } });
  assert.equal(put.status, 200);
  const got = await (await call('GET', '/studio/save/', { token: studio })).json();
  assert.deepEqual(got.data, { days: {} });
  assert.equal((await call('GET', '/me/', { token: studio })).status, 200);
  assert.equal((await call('GET', '/bp/share/', { token: studio })).status, 403);
  assert.equal((await call('GET', '/components/user/', { token: studio })).status, 403);
  assert.equal((await call('GET', '/dict/admin/words/', { token: studio })).status, 403);
  const adminStudio = await sign({
    sub: ADMIN, client_id: 'studio', scope: 'studio', roles: ['admin'],
  });
  assert.equal((await call('GET', '/dict/admin/words/', { token: adminStudio })).status, 200);
  const noScope = await sign({ sub: USER, client_id: 'studio', scope: '' });
  assert.equal((await call('GET', '/studio/save/', { token: noScope })).status, 403);
});

test('/me creates the profile on first use and reports points', { skip: !url }, async () => {
  const me = await (await call('GET', '/me/', { as: 'user' })).json();
  assert.deepEqual(me, {
    sub: USER, balance: 5, favoriteCount: 0, display: { name: '小明', email: 'ming@example.com', picture: null },
  });
  const fresh = await (await call('GET', '/me/', { as: 'admin' })).json();
  assert.equal(fresh.balance, 30);
});

test('favorites live in the profile; only owners and admins delete components', { skip: !url }, async () => {
  const type = await mongoose.connection.collection('componenttypes').insertOne({ title: 'Button' });
  const component = await mongoose.connection.collection('components').insertOne({ title: 'A', componentsType: type.insertedId, userId: new mongoose.Types.ObjectId(OTHER) });
  const id = String(component.insertedId);
  assert.equal((await call('POST', '/components/favorites/', { as: 'user', body: { componentId: id } })).status, 200);
  const ids = await (await call('GET', '/components/favorites/id/', { as: 'user' })).json();
  assert.deepEqual(ids.idList, [id]);
  assert.equal((await (await call('GET', '/me/', { as: 'user' })).json()).favoriteCount, 1);
  // Someone else's component cannot be deleted by an ordinary account, but an admin can
  assert.equal((await call('DELETE', `/components/${id}/`, { as: 'user' })).status, 403);
  assert.equal((await call('DELETE', `/components/${id}/`, { as: 'admin' })).status, 200);
});

test('points: admins search, read and adjust; the balance never goes below zero', { skip: !url }, async () => {
  const list = await (await call('GET', '/admin/profiles/?q=ming', { as: 'admin' })).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].sub, USER);
  const bySub = await (await call('GET', `/admin/profiles/?q=${OTHER}`, { as: 'admin' })).json();
  assert.equal(bySub.items[0].display.name, '小華');

  const add = await call('POST', `/admin/profiles/${USER}/balance`, { as: 'admin', body: { delta: 10, reason: '活動贈點' } });
  assert.deepEqual(await add.json(), { sub: USER, balance: 15 });
  const tooMuch = await call('POST', `/admin/profiles/${OTHER}/balance`, { as: 'admin', body: { delta: -1 } });
  assert.equal((await tooMuch.json()).error, 'invalid_balance');
  assert.equal((await call('POST', `/admin/profiles/${USER}/balance`, { as: 'admin', body: { delta: 1.5 } })).status, 400);
  assert.equal((await call('POST', '/admin/profiles/64f1c2a0b1c2d3e4f5a6b7ee/balance', { as: 'admin', body: { delta: 1 } })).status, 404);

  const detail = await (await call('GET', `/admin/profiles/${USER}`, { as: 'admin' })).json();
  assert.equal(detail.balance, 15);
  assert.equal(detail.transitions[0].type, 'admin_adjust');
  assert.equal(detail.transitions[0].actor, ADMIN);
});

test('the provider erases an account\'s data with its internal token, and nobody else can', { skip: !url }, async () => {
  const db = mongoose.connection;
  await db.collection('bp_entries').insertOne({ owner: OTHER, kind: 'reading' });
  await db.collection('bp_shares').insertOne({ owner: OTHER });
  await db.collection('studio_saves').insertOne({
    _id: OTHER, revision: 1, data: '{}', updatedAt: new Date(),
  });
  await db.collection('usertransitions').insertOne({ userId: new mongoose.Types.ObjectId(OTHER), amount: -1 });
  await db.collection('bp_entries').insertOne({ owner: USER, kind: 'reading' });

  const internal = await sign({ sub: 'idp-internal', client_id: 'idp-internal', scope: 'accounts.erase' });
  assert.equal((await call('POST', `/internal/accounts/${OTHER}/erase`, { as: 'admin' })).status, 403);
  const userToken = await sign({ sub: USER, client_id: 'studio', scope: 'accounts.erase' });
  assert.equal((await call('POST', `/internal/accounts/${OTHER}/erase`, { token: userToken })).status, 403);

  const res = await call('POST', `/internal/accounts/${OTHER}/erase`, { token: internal });
  assert.equal(res.status, 200);
  const { erased } = await res.json();
  assert.equal(erased.bp_entries, 1);
  assert.equal(erased.studio_saves, 1);
  assert.equal(erased.user_profiles, 1);
  assert.equal(erased.components, 0);
  assert.equal(await db.collection('bp_entries').countDocuments({ owner: USER }), 1);
  const again = await (await call('POST', `/internal/accounts/${OTHER}/erase`, { token: internal })).json();
  assert.equal(again.erased.user_profiles, 0);
});

test('erasing also removes the old users record, its one-time links and its files', { skip: !url }, async () => {
  const db = mongoose.connection;
  const ERASED = '64f1c2a0b1c2d3e4f5a6b704';
  const KEPT = '64f1c2a0b1c2d3e4f5a6b705';
  const id = (value) => new mongoose.Types.ObjectId(value);
  await db.collection('users').insertMany([
    {
      _id: id(ERASED), email: 'gone@example.com', password: '$2b$10$x', photo: 'me.png',
    },
    { _id: id(KEPT), email: 'kept@example.com', password: '$2b$10$y' },
  ]);
  await db.collection('account_tokens').insertMany([
    { userId: id(ERASED), purpose: 'reset-password', tokenHash: 'h1' },
    { userId: id(KEPT), purpose: 'reset-password', tokenHash: 'h2' },
  ]);
  await db.collection('components').insertMany([
    { userId: id(ERASED), styleFileName: 't-gone-1.css', javascriptFileName: 't-gone-1.js' },
    { userId: id(ERASED), styleFileName: '../../escape.css', javascriptFileName: '' },
    { userId: id(KEPT), styleFileName: 't-kept-1.css' },
  ]);

  const uploads = await fs.mkdtemp(join(os.tmpdir(), 'uploads-'));
  try {
    const write = async (file) => {
      await fs.mkdir(dirname(join(uploads, file)), { recursive: true });
      await fs.writeFile(join(uploads, file), 'x');
    };
    await Promise.all(['css/t-gone-1.css', 'js/t-gone-1.js', 'css/t-kept-1.css', `user/${ERASED}/img/me.png`, `user/${KEPT}/img/a.png`].map(write));
    const exists = (file) => fs.access(join(uploads, file)).then(() => true, () => false);

    const erased = await eraseAccount(ERASED, { uploadsDir: uploads });
    assert.equal(erased.users, 1);
    assert.equal(erased.account_tokens, 1);
    assert.equal(erased.components, 2);
    assert.equal(erased.files, 3);
    assert.equal(await exists('css/t-gone-1.css'), false);
    assert.equal(await exists('js/t-gone-1.js'), false);
    assert.equal(await exists(`user/${ERASED}`), false);

    // Another account keeps everything, old record included
    assert.equal(await exists('css/t-kept-1.css'), true);
    assert.equal(await exists(`user/${KEPT}/img/a.png`), true);
    assert.equal(await db.collection('users').countDocuments({ _id: id(KEPT) }), 1);
    assert.equal(await db.collection('account_tokens').countDocuments({ userId: id(KEPT) }), 1);
    assert.equal(await db.collection('components').countDocuments({ userId: id(KEPT) }), 1);

    const again = await eraseAccount(ERASED, { uploadsDir: uploads });
    assert.deepEqual([again.users, again.account_tokens, again.files], [0, 0, 0]);
  } finally {
    await fs.rm(uploads, { recursive: true, force: true });
  }
});
