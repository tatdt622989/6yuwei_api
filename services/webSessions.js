/* eslint-disable no-underscore-dangle */
const crypto = require('crypto');
const WebSession = require('../models/webSession');

/*
 * Token handler sessions (docs/Session-API.md §5). The browser holds a random id in an HttpOnly
 * cookie; the database holds its hash, the account's roles and the encrypted refresh token.
 * Every ten minutes at most, the refresh token is used once to confirm that the sign-in is still
 * valid at the identity provider.
 */

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const SESSION_LIFETIME = 30 * DAY;
const CHECK_EVERY = 10 * MINUTE;
const CHECK_LOCK = 30 * 1000;
// The cookie's Max-Age is renewed at most once a day
const RENEW_COOKIE_AFTER = DAY;

const hashOf = (sid) => crypto.createHash('sha256').update(String(sid)).digest('hex');

const displayOf = (claims) => ({
  name: claims.name ?? null, email: claims.email ?? null, picture: claims.picture ?? null,
});

const createWebSessions = ({
  idp, tokenCrypto, onRefresh = async () => {}, now = () => Date.now(), log = console.warn,
}) => {
  const create = async ({
    claims, refreshToken, app,
  }) => {
    const sid = crypto.randomBytes(32).toString('base64url');
    const at = new Date(now());
    await WebSession.create({
      _id: hashOf(sid),
      sub: String(claims.sub),
      roles: Array.isArray(claims.roles) ? claims.roles : [],
      idpSid: claims.sid ?? null,
      refreshToken: tokenCrypto.encrypt(refreshToken),
      app,
      display: displayOf(claims),
      checkedAt: at,
      lastSeenAt: at,
      expiresAt: new Date(now() + SESSION_LIFETIME),
    });
    return sid;
  };

  /** Uses the refresh token once; only one request at a time does this for a session. */
  const confirm = async (session) => {
    const at = now();
    const claimed = await WebSession.findOneAndUpdate(
      {
        _id: session._id,
        checkedAt: { $lte: new Date(at - CHECK_EVERY) },
        $or: [
          { checkLockUntil: { $exists: false } },
          { checkLockUntil: null },
          { checkLockUntil: { $lte: new Date(at) } },
        ],
      },
      { $set: { checkLockUntil: new Date(at + CHECK_LOCK) } },
      { returnDocument: 'after' },
    );
    if (!claimed) return session;
    try {
      const { claims, refreshToken } = await idp.refresh(tokenCrypto.decrypt(claimed.refreshToken));
      const update = {
        checkedAt: new Date(now()),
        refreshToken: tokenCrypto.encrypt(refreshToken),
        checkLockUntil: null,
      };
      if (claims) {
        update.roles = Array.isArray(claims.roles) ? claims.roles : [];
        update.display = displayOf(claims);
        await onRefresh(String(claims.sub), update.display);
      }
      return await WebSession.findOneAndUpdate(
        { _id: session._id },
        { $set: update },
        { returnDocument: 'after' },
      );
    } catch (error) {
      if (error.code === 'invalid_grant') {
        await WebSession.deleteOne({ _id: session._id });
        return null;
      }
      // The provider could not be reached: keep the session and try again next time
      log(`session check failed (${error.code ?? 'error'}): ${error.message}`);
      await WebSession.updateOne({ _id: session._id }, { $set: { checkLockUntil: null } });
      return claimed;
    }
  };

  /**
   * The session behind a cookie value, or null. renewCookie says whether to send the cookie again
   * with a fresh Max-Age.
   */
  const resolve = async (sid) => {
    if (typeof sid !== 'string' || !sid) return null;
    let session = await WebSession.findById(hashOf(sid));
    if (!session || session.expiresAt.getTime() <= now()) return null;
    if (session.checkedAt.getTime() <= now() - CHECK_EVERY) {
      session = await confirm(session);
      if (!session) return null;
    }
    const renewCookie = session.lastSeenAt.getTime() <= now() - RENEW_COOKIE_AFTER;
    if (renewCookie || session.lastSeenAt.getTime() <= now() - MINUTE) {
      await WebSession.updateOne(
        { _id: session._id },
        { $set: { lastSeenAt: new Date(now()), expiresAt: new Date(now() + SESSION_LIFETIME) } },
      );
    }
    return { session, renewCookie };
  };

  /** Removes one session and returns its refresh token, so it can be revoked. */
  const destroy = async (sid) => {
    const session = await WebSession.findOneAndDelete({ _id: hashOf(sid) });
    if (!session) return null;
    return { refreshToken: tokenCrypto.decrypt(session.refreshToken), app: session.app };
  };

  /** A back-channel logout: the provider names the session (sid) or the whole account (sub). */
  const endFromProvider = async ({ sid, sub }) => {
    const filter = sid ? { idpSid: sid } : { sub };
    const { deletedCount } = await WebSession.deleteMany(filter);
    return deletedCount;
  };

  return {
    create, resolve, destroy, endFromProvider, hashOf,
  };
};

module.exports = {
  SESSION_LIFETIME, CHECK_EVERY, createWebSessions, hashOf,
};
