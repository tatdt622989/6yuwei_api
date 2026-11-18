/**
 * Sites that sign in through the token handler (docs/Session-API.md §1). The browser reaches
 * `main` through the Nuxt /api proxy and `bp` directly, so each has its own callback address.
 */
const WEB_APPS = {
  production: {
    main: { origin: 'https://6yuwei.com', callback: 'https://6yuwei.com/api/session/callback' },
    bp: { origin: 'https://bp.6yuwei.com', callback: 'https://api.6yuwei.com/session/callback' },
  },
  staging: {
    main: { origin: 'https://stg.6yuwei.com', callback: 'https://stg.6yuwei.com/api/session/callback' },
    bp: { origin: 'https://bp-stg.6yuwei.com', callback: 'https://api-stg.6yuwei.com/session/callback' },
  },
  development: {
    main: { origin: 'http://localhost:3000', callback: 'http://localhost:3000/api/session/callback' },
    bp: { origin: 'http://localhost:5173', callback: 'http://localhost:3001/session/callback' },
  },
};

const webAppsFor = (env) => {
  const apps = WEB_APPS[env];
  if (!apps) throw new Error(`WEB_APPS_ENV must be one of ${Object.keys(WEB_APPS).join(', ')}`);
  return apps;
};

module.exports = { WEB_APPS, webAppsFor };
