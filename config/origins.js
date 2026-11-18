/*
 * Sites allowed to call this API from a browser with credentials, and to change data with a
 * session cookie (docs/Auth-v2.md §6). Guessai left this API with its own service, and
 * app.6yuwei.com was only here for it.
 */

const productionOrigins = [
  'https://6yuwei.com',
  'https://www.6yuwei.com',
  'https://ai.6yuwei.com',
  'https://api.6yuwei.com',
  'https://bp.6yuwei.com',
];

const stagingOrigins = [
  'https://stg.6yuwei.com',
  'https://api-stg.6yuwei.com',
  'https://bp-stg.6yuwei.com',
];

const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:8888',
  'http://127.0.0.1:5500',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://localhost:5173',
];

const ORIGINS = {
  production: productionOrigins,
  staging: stagingOrigins,
  development: developmentOrigins,
};

/** env is WEB_APPS_ENV: production, staging or development. */
const getAllowedOrigins = (env) => ORIGINS[env] ?? productionOrigins;

module.exports = {
  developmentOrigins,
  getAllowedOrigins,
  productionOrigins,
  stagingOrigins,
};
