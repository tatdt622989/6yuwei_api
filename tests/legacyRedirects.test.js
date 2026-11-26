const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const express = require('express');
const { createLegacyRedirects } = require('../routes/legacyRedirects');

let server;
let base;
before(async () => {
  const app = express();
  app.use(createLegacyRedirects());
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('the old bp Google sign-in address leads to the new bp sign-in', async () => {
  for (const path of ['/bp/google/', '/bp/google']) {
    const res = await fetch(base + path, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/session/login?app=bp&return=%2F');
  }
});

test('other bp addresses are not touched', async () => {
  const res = await fetch(`${base}/bp/entries/`, { redirect: 'manual' });
  assert.equal(res.status, 404);
});
