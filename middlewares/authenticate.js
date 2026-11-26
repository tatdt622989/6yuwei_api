const SESSION_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/*
 * Who is calling (docs/Auth-v2.md §1) and what each route allows (§2). authenticate sets
 * req.auth = { sub, roles, scopes, clientId, via } or null; the guards decide.
 */

const unauthenticated = (res) => res.status(401).json({ error: 'unauthenticated' });
const forbidden = (res, error = 'forbidden') => res.status(403).json({ error });

/**
 * - idp.verifyAccessToken(token, audience) for Bearer tokens
 * - sessions.resolve(cookieValue) for the token handler cookie
 */
const createAuthenticate = ({
  idp, apiResource, sessions, cookieName, cookieOptions,
}) => async (req, res, next) => {
  req.auth = null;
  const header = req.get('authorization');
  if (header) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    try {
      if (!match) throw new Error('not a Bearer token');
      const payload = await idp.verifyAccessToken(match[1], apiResource);
      req.auth = {
        sub: payload.sub,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
        scopes: new Set(String(payload.scope ?? '').split(' ').filter(Boolean)),
        clientId: payload.client_id,
        via: 'bearer',
      };
      return next();
    } catch {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return res.status(401).json({ error: 'invalid_token' });
    }
  }

  const sid = req.cookies?.[cookieName];
  if (!sid) return next();
  try {
    const resolved = await sessions.resolve(sid);
    if (!resolved) {
      res.clearCookie(cookieName, cookieOptions);
      return next();
    }
    const { session } = resolved;
    req.auth = {
      sub: session.sub, roles: session.roles ?? [], scopes: null, clientId: 'web', via: 'session', session,
    };
    if (resolved.renewCookie) {
      res.cookie(cookieName, sid, { ...cookieOptions, maxAge: SESSION_MAX_AGE });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * A signed-in caller. Bearer tokens (apps) are accepted only on routes that name the scope they
 * need, so a Nihongo Studio token cannot reach the web features.
 */
const requireUser = ({ scope } = {}) => (req, res, next) => {
  const { auth } = req;
  if (!auth) return unauthenticated(res);
  if (auth.via === 'bearer') {
    if (!scope || !auth.scopes.has(scope) || auth.clientId === 'idp-internal') return forbidden(res, 'insufficient_scope');
  }
  return next();
};

const requireRole = (role, options) => {
  const user = requireUser(options);
  return (req, res, next) => user(
    req,
    res,
    () => (req.auth.roles.includes(role) ? next() : forbidden(res)),
  );
};

/** Only the identity provider's own client credentials token with this scope. */
const requireInternal = (scope) => (req, res, next) => {
  const { auth } = req;
  if (!auth) return unauthenticated(res);
  if (auth.via !== 'bearer' || auth.clientId !== 'idp-internal' || !auth.scopes.has(scope)) return forbidden(res);
  return next();
};

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Session-cookie requests that change data must come from a listed site and carry
 * X-Requested-With: 6yuwei, which forces a CORS preflight for anything cross-site (Session-API §4).
 * Requests without a session pass, unless `always` is set (the logout endpoint).
 */
const requireTrustedOrigin = (allowedOrigins, { always = false } = {}) => (req, res, next) => {
  if (!MUTATING.has(req.method)) return next();
  if (!always && req.auth?.via !== 'session') return next();
  if (!allowedOrigins.includes(req.get('origin')) || req.get('x-requested-with') !== '6yuwei') {
    return forbidden(res, 'origin_not_allowed');
  }
  return next();
};

module.exports = {
  createAuthenticate, requireInternal, requireRole, requireTrustedOrigin, requireUser,
};
