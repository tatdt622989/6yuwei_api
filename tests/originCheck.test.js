const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rejectForeignOrigins } = require('../middlewares/originCheck');

const check = ({ method = 'POST', origin, cookie = 'token' }) => {
  const outcome = {};
  const res = { status: (code) => { outcome.status = code; return { send: () => {} }; } };
  const req = {
    method,
    cookies: cookie ? { access_token: cookie } : {},
    get: () => origin,
  };
  rejectForeignOrigins(['https://site.example'])(req, res, () => { outcome.passed = true; });
  return outcome;
};

test('a write with the login cookie from another site is refused', () => {
  assert.equal(check({ origin: 'https://other.example' }).status, 403);
  assert.equal(check({ origin: 'null' }).status, 403);
  assert.equal(check({ method: 'DELETE', origin: 'https://other.example' }).status, 403);
});

test('listed sites, apps, reads and requests without the cookie pass', () => {
  assert.equal(check({ origin: 'https://site.example' }).passed, true);
  assert.equal(check({}).passed, true);
  assert.equal(check({ method: 'GET', origin: 'https://other.example' }).passed, true);
  assert.equal(check({ origin: 'https://other.example', cookie: '' }).passed, true);
});
