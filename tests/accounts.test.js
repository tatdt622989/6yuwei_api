const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  appOf, awaitsVerification, loginUrlOf, normalizeEmail, passwordProblem,
} = require('../services/accounts');
const { consumeQuota } = require('../middlewares/rateLimit');

test('normalizeEmail ignores case and surrounding spaces', () => {
  assert.equal(normalizeEmail('  Someone@Example.COM '), 'someone@example.com');
});

test('passwordProblem enforces the length limits', () => {
  assert.ok(passwordProblem('1234567'));
  assert.ok(passwordProblem('        '));
  assert.ok(passwordProblem(undefined));
  assert.ok(passwordProblem('a'.repeat(73)));
  assert.equal(passwordProblem('12345678'), '');
  assert.equal(passwordProblem('a'.repeat(72)), '');
});

test('passwordProblem counts bytes, because bcrypt ignores what comes after 72 of them', () => {
  assert.ok(passwordProblem('密'.repeat(25)));
  assert.equal(passwordProblem('密'.repeat(24)), '');
});

test('only new unconfirmed accounts wait for verification', () => {
  assert.equal(awaitsVerification({ verificationRequired: true }), true);
  assert.equal(awaitsVerification({ verificationRequired: true, emailVerifiedAt: new Date() }), false);
  assert.equal(awaitsVerification({ verificationRequired: false }), false);
  assert.equal(awaitsVerification({}), false);
});

test('the link back goes only to known apps', () => {
  process.env.BP_APP_URL = 'https://bp.example.com/';
  process.env.FRONTEND_DOMAIN = 'https://main.example.com/';
  assert.equal(loginUrlOf('bp'), 'https://bp.example.com/login');
  assert.equal(loginUrlOf(appOf('https://evil.example.com')), 'https://main.example.com/admin/login/');
  assert.equal(appOf('bp'), 'bp');
  assert.equal(appOf({ $ne: 1 }), 'main');
});

test('consumeQuota stops at the limit and keeps keys apart', () => {
  const take = (key) => consumeQuota({
    scope: 'test', key, maxRequests: 2, windowMs: 60000,
  });
  assert.equal(take('a'), true);
  assert.equal(take('a'), true);
  assert.equal(take('a'), false);
  assert.equal(take('b'), true);
});
