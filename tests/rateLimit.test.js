const assert = require('node:assert/strict');
const { test } = require('node:test');
const { consumeQuota } = require('../middlewares/rateLimit');

test('consumeQuota stops at the limit and keeps keys apart', () => {
  const take = (key) => consumeQuota({
    scope: 'test', key, maxRequests: 2, windowMs: 60000,
  });
  assert.equal(take('a'), true);
  assert.equal(take('a'), true);
  assert.equal(take('a'), false);
  assert.equal(take('b'), true);
});
