const { webAppsFor } = require('../../config/webApps');
const { createAuthenticate } = require('../../middlewares/authenticate');
const { createSessionRouter } = require('../../routes/session');
const { recordSignIn } = require('../userProfiles');
const { createWebSessions } = require('../webSessions');
const { createIdp } = require('./idp');
const { createTokenCrypto } = require('./tokenCrypto');

/**
 * Identity v2 (docs/Auth-v2.md, docs/Session-API.md). Returns null when OIDC_ISSUER is not set,
 * so the old sign-in keeps working until the cut-over removes it.
 */
const createIdentityV2 = (env = process.env, { fetchImpl } = {}) => {
  if (!env.OIDC_ISSUER) return null;
  const required = ['API_RESOURCE', 'OIDC_CLIENT_WEB_SECRET', 'SESSION_TOKEN_KEY', 'WEB_APPS_ENV'];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`identity v2 needs ${missing.join(', ')}`);

  const issuer = env.OIDC_ISSUER.replace(/\/$/, '');
  const secure = env.WEB_APPS_ENV !== 'development';
  const cookieOptions = {
    httpOnly: true, secure, sameSite: 'lax', path: '/',
  };
  const cookies = {
    session: { name: secure ? '__Host-6y_sid' : '6y_sid', options: cookieOptions },
    login: { name: secure ? '__Host-6y_login' : '6y_login', options: cookieOptions },
  };

  const idp = createIdp({
    issuer, clientId: 'web', clientSecret: env.OIDC_CLIENT_WEB_SECRET, fetchImpl,
  });
  const webApps = webAppsFor(env.WEB_APPS_ENV);
  const sessions = createWebSessions({
    idp,
    tokenCrypto: createTokenCrypto(env.SESSION_TOKEN_KEY),
    onRefresh: (sub, display) => recordSignIn(sub, display),
  });

  return {
    webApps,
    authenticate: createAuthenticate({
      idp, apiResource: env.API_RESOURCE, sessions, cookieName: cookies.session.name, cookieOptions,
    }),
    sessionRouter: createSessionRouter({
      idp, sessions, webApps, cookies, issuer, accountUrl: `${issuer}/account`, onSignIn: recordSignIn,
    }),
  };
};

module.exports = { createIdentityV2 };
