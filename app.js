require('dotenv').config({ quiet: true });
const { createServer } = require('http');
const mongoose = require('mongoose');
const { buildApp } = require('./buildApp');
const { getAllowedOrigins } = require('./config/origins');
const { createIdentityV2 } = require('./services/oidc/setup');

const dbURL = process.env.DB_URL;
const dbName = process.env.DB_NAME || '6yuwei';
const env = process.env.NODE_ENV;
const port = Number(process.env.PORT) || 3000;

const buildMongoUri = (uri, defaultDbName) => {
  if (!uri) {
    return uri;
  }

  try {
    const parsedUri = new URL(uri);

    if (!parsedUri.pathname || parsedUri.pathname === '/') {
      parsedUri.pathname = `/${defaultDbName}`;
    }

    if (parsedUri.username && !parsedUri.searchParams.has('authSource')) {
      parsedUri.searchParams.set('authSource', 'admin');
    }

    return parsedUri.toString();
  } catch (err) {
    if (uri.includes('/?')) {
      const connector = uri.includes('authSource=') ? '' : '&authSource=admin';
      return uri.replace('/?', `/${defaultDbName}?`) + connector;
    }

    if (uri.endsWith('/')) {
      const connector = uri.includes('?') ? '&' : '?';
      return `${uri}${defaultDbName}${connector}authSource=admin`;
    }

    return uri;
  }
};

// Signing in goes through the identity provider only (docs/Auth-v2.md), so the API does not
// start without it
let identity;
try {
  identity = createIdentityV2();
} catch (error) {
  console.error(`configuration error: ${error.message}`);
  process.exit(1);
}
if (!identity) {
  console.error('configuration error: OIDC_ISSUER is required (see docs/Auth-v2.md §7)');
  process.exit(1);
}

mongoose.set('strictQuery', true);
mongoose
  .connect(buildMongoUri(dbURL, dbName), { family: 4 })
  .then(() => {
    console.log('資料庫連接成功');
  })
  .catch((err) => {
    console.log(`資料庫連接失敗: ${err.message}`);
  });

const app = buildApp({
  identity,
  // WEB_APPS_ENV is required by identity v2, so it is always set here
  allowedOrigins: getAllowedOrigins(process.env.WEB_APPS_ENV),
  trustProxy: env === 'production',
});
const server = createServer(app);

// A rejected promise outside a route must not stop the API for everyone
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

server.listen(port, () => {
  console.log(`伺服器正在port${port}上運行`);
});

server.timeout = 1000 * 60 * 5;
