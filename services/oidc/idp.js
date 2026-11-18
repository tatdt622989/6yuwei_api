const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');

/**
 * Talks to the identity provider (6yuwei_auth/docs/oidc.md): discovery, keys, the code
 * exchange, refresh, revocation, and checking ID, access and logout tokens.
 * fetchImpl can be replaced in tests.
 */

class IdpError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const CLOCK_TOLERANCE = 30;

const randomValue = () => crypto.randomBytes(32).toString('base64url');
const challengeOf = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url');

const createIdp = ({
  issuer, clientId, clientSecret, fetchImpl = globalThis.fetch,
}) => {
  let discovery;
  let keys;

  const metadata = async () => {
    if (!discovery) {
      const response = await fetchImpl(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new IdpError('unreachable', `discovery answered ${response.status}`);
      const body = await response.json();
      if (body.issuer !== issuer) throw new IdpError('misconfigured', `discovery issuer ${body.issuer} is not ${issuer}`);
      discovery = body;
    }
    return discovery;
  };

  const jwks = async () => {
    if (!keys) {
      const uri = new URL((await metadata()).jwks_uri);
      keys = createRemoteJWKSet(uri, { cacheMaxAge: 10 * 60 * 1000 });
    }
    return keys;
  };

  const basicAuth = `Basic ${Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(clientSecret)}`).toString('base64')}`;

  const post = async (endpoint, form) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: basicAuth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      throw new IdpError('unreachable', error.message);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new IdpError(body.error === 'invalid_grant' ? 'invalid_grant' : 'rejected', `${response.status} ${body.error ?? ''}`);
    return body;
  };

  /** Verifies an ID token from this client's sign-in; nonce is checked when given. */
  const verifyIdToken = async (idToken, { nonce } = {}) => {
    try {
      const { payload } = await jwtVerify(idToken, await jwks(), {
        issuer, audience: clientId, algorithms: ['ES256'], clockTolerance: CLOCK_TOLERANCE,
      });
      if (nonce !== undefined && payload.nonce !== nonce) throw new IdpError('invalid_id_token', 'nonce mismatch');
      return payload;
    } catch (error) {
      if (error instanceof IdpError) throw error;
      throw new IdpError('invalid_id_token', error.message);
    }
  };

  return {
    metadata,

    /** The authorization URL plus the secrets the callback needs. */
    async startSignIn({ redirectUri, scope, prompt }) {
      const state = randomValue();
      const nonce = randomValue();
      const codeVerifier = randomValue();
      const url = new URL((await metadata()).authorization_endpoint);
      Object.entries({
        client_id: clientId,
        response_type: 'code',
        scope,
        redirect_uri: redirectUri,
        state,
        nonce,
        code_challenge: challengeOf(codeVerifier),
        code_challenge_method: 'S256',
        ...(prompt ? { prompt } : {}),
      }).forEach(([key, value]) => url.searchParams.set(key, value));
      return {
        url: url.toString(), state, nonce, codeVerifier,
      };
    },

    /** Exchanges an authorization code; returns { claims, refreshToken }. */
    async finishSignIn({
      code, codeVerifier, redirectUri, nonce,
    }) {
      const { token_endpoint: tokenEndpoint } = await metadata();
      const body = await post(tokenEndpoint, {
        grant_type: 'authorization_code', code, code_verifier: codeVerifier, redirect_uri: redirectUri,
      });
      if (typeof body.id_token !== 'string') throw new IdpError('invalid_id_token', 'no ID token');
      const claims = await verifyIdToken(body.id_token, { nonce });
      return { claims, refreshToken: body.refresh_token ?? null };
    },

    /** Uses a refresh token; returns { claims, refreshToken } (the provider rotates it). */
    async refresh(refreshToken) {
      const { token_endpoint: tokenEndpoint } = await metadata();
      const body = await post(tokenEndpoint, { grant_type: 'refresh_token', refresh_token: refreshToken });
      return {
        claims: typeof body.id_token === 'string' ? await verifyIdToken(body.id_token) : null,
        refreshToken: body.refresh_token ?? refreshToken,
      };
    },

    async revoke(refreshToken) {
      const { revocation_endpoint: endpoint } = await metadata();
      if (!endpoint) return;
      await post(endpoint, { token: refreshToken, token_type_hint: 'refresh_token' }).catch(() => {});
    },

    /** The provider's sign-out page, which comes back to postLogoutRedirectUri. */
    async logoutUrl(postLogoutRedirectUri) {
      const url = new URL((await metadata()).end_session_endpoint);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri);
      return url.toString();
    },

    /** Checks a back-channel logout token (oidc.md §8.2); returns { sub, sid }. */
    async verifyLogoutToken(token) {
      let payload;
      try {
        ({ payload } = await jwtVerify(token, await jwks(), {
          issuer, audience: clientId, algorithms: ['ES256'], clockTolerance: CLOCK_TOLERANCE, maxTokenAge: '5m',
        }));
      } catch (error) {
        throw new IdpError('invalid_logout_token', error.message);
      }
      if (!payload.events || typeof payload.events[BACKCHANNEL_EVENT] !== 'object') throw new IdpError('invalid_logout_token', 'no logout event');
      if (payload.nonce !== undefined) throw new IdpError('invalid_logout_token', 'logout tokens carry no nonce');
      if (!payload.sub && !payload.sid) throw new IdpError('invalid_logout_token', 'no sub or sid');
      return { sub: payload.sub ?? null, sid: payload.sid ?? null };
    },

    /** Checks an access token for a resource server (Auth-v2.md §1). */
    async verifyAccessToken(token, audience) {
      try {
        const { payload } = await jwtVerify(token, await jwks(), {
          issuer, audience, typ: 'at+jwt', algorithms: ['ES256'], clockTolerance: CLOCK_TOLERANCE,
        });
        return payload;
      } catch (error) {
        throw new IdpError('invalid_token', error.message);
      }
    },
  };
};

module.exports = { IdpError, createIdp, challengeOf };
