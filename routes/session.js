const crypto = require('crypto');
const express = require('express');
const WebLoginState = require('../models/webLoginState');
const { requireTrustedOrigin } = require('../middlewares/authenticate');

/*
 * The token handler (docs/Session-API.md §3): signs 6yuwei.com and bp in at the identity provider
 * and keeps the tokens here. The browser only gets an HttpOnly session cookie.
 */

const LOGIN_TTL_MS = 10 * 60 * 1000;
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const SCOPE = 'openid email profile roles offline_access';
const hashOf = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** A path on the same site, or '/'. */
const safeReturn = (value) => {
  if (typeof value !== 'string' || value.length > 512) return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
};

/**
 * - webApps: { main: { origin, callback }, bp: { ... } }
 * - cookies: { session: { name, options }, login: { name, options } }
 * - onSignIn(sub, display): records the profile
 * - accountUrl: the provider's account page
 */
const createSessionRouter = ({
  idp, sessions, webApps, cookies, issuer, accountUrl, onSignIn, log = console.error,
}) => {
  const router = express.Router();
  const appOf = (key) => (Object.hasOwn(webApps, key) ? webApps[key] : null);
  const backTo = (res, app, error) => res.redirect(302, `${app.origin}/?login_error=${error}`);

  router.get('/login', async (req, res) => {
    const key = typeof req.query.app === 'string' ? req.query.app : '';
    const app = appOf(key);
    if (!app) return res.status(400).json({ error: 'invalid_request', message: 'Unknown app' });
    try {
      const start = await idp.startSignIn({ redirectUri: app.callback, scope: SCOPE, prompt: 'consent' });
      // The app name rides in the state, so an expired sign-in still finds its way back
      const state = `${key}.${start.state}`;
      const url = new URL(start.url);
      url.searchParams.set('state', state);
      await WebLoginState.create({
        _id: hashOf(state),
        codeVerifier: start.codeVerifier,
        nonce: start.nonce,
        app: key,
        returnTo: safeReturn(req.query.return),
        expiresAt: new Date(Date.now() + LOGIN_TTL_MS),
      });
      res.cookie(cookies.login.name, state, { ...cookies.login.options, maxAge: LOGIN_TTL_MS });
      return res.redirect(302, url.toString());
    } catch (error) {
      log('sign-in could not start:', error.message);
      return res.status(503).type('text').send('登入服務暫時無法使用，請稍後再試。');
    }
  });

  router.get('/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const app = appOf(state.split('.')[0]) ?? webApps.main;
    const cookieState = req.cookies?.[cookies.login.name];
    res.clearCookie(cookies.login.name, cookies.login.options);

    const record = state && cookieState === state
      ? await WebLoginState.findOneAndDelete({ _id: hashOf(state), expiresAt: { $gt: new Date() } })
      : null;
    if (!record) return backTo(res, app, 'expired');
    if (req.query.error) return backTo(res, app, req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    if (typeof req.query.code !== 'string' || (req.query.iss !== undefined && req.query.iss !== issuer)) {
      return backTo(res, app, 'failed');
    }

    try {
      const { claims, refreshToken } = await idp.finishSignIn({
        code: req.query.code,
        codeVerifier: record.codeVerifier,
        redirectUri: webApps[record.app].callback,
        nonce: record.nonce,
      });
      if (!refreshToken) throw new Error('the provider issued no refresh token');
      const sid = await sessions.create({ claims, refreshToken, app: record.app });
      const { name, email, picture } = claims;
      await onSignIn(String(claims.sub), { name, email, picture });
      const sessionCookie = { ...cookies.session.options, maxAge: SESSION_MAX_AGE };
      res.cookie(cookies.session.name, sid, sessionCookie);
      return res.redirect(302, `${webApps[record.app].origin}${record.returnTo}`);
    } catch (error) {
      log('sign-in failed:', error.message);
      return backTo(res, app, 'failed');
    }
  });

  router.get('/me', (req, res) => {
    const session = req.auth?.via === 'session' ? req.auth.session : null;
    if (!session) return res.status(401).json({ error: 'unauthenticated' });
    return res.json({
      sub: session.sub,
      name: session.display?.name ?? null,
      email: session.display?.email ?? null,
      picture: session.display?.picture ?? null,
      roles: session.roles ?? [],
      accountUrl,
    });
  });

  const allowedOrigins = Object.values(webApps).map((app) => app.origin);
  router.post('/logout', requireTrustedOrigin(allowedOrigins, { always: true }), async (req, res, next) => {
    try {
      const sid = req.cookies?.[cookies.session.name];
      const ended = sid ? await sessions.destroy(sid) : null;
      if (ended) await idp.revoke(ended.refreshToken);
      res.clearCookie(cookies.session.name, cookies.session.options);
      const app = (ended && webApps[ended.app]) ?? Object.values(webApps).find((a) => a.origin === req.get('origin')) ?? webApps.main;
      return res.json({ logoutUrl: await idp.logoutUrl(`${app.origin}/`) });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/backchannel-logout', express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const target = await idp.verifyLogoutToken(String(req.body?.logout_token ?? ''));
      await sessions.endFromProvider(target);
      res.set('Cache-Control', 'no-store');
      return res.status(200).end();
    } catch (error) {
      log('back-channel logout refused:', error.message);
      return res.status(400).json({ error: 'invalid_request' });
    }
  });

  return router;
};

module.exports = { createSessionRouter, safeReturn };
