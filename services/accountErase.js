const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const BpEntry = require('../models/bpEntry');
const BpShare = require('../models/bpShare');
const StudioSave = require('../models/studioSave');
const UserProfile = require('../models/userProfile');
const UserTransition = require('../models/userTransition');
const WebSession = require('../models/webSession');
const { Component } = require('../models/component');
const { UPLOADS_DIR, safeFileName } = require('./uploadFiles');

/** Removes one file or folder; returns 1 when something was there. */
const removePath = async (target) => {
  try {
    await fs.access(target);
  } catch {
    return 0;
  }
  await fs.rm(target, { recursive: true, force: true });
  return 1;
};

/**
 * The account's files: the CSS and JavaScript of the components it made, and the folder of its
 * old profile pictures (uploads/user/<id>, from before the identity provider).
 */
const removeFiles = async (id, components, uploadsDir) => {
  const targets = components.flatMap(({ styleFileName, javascriptFileName }) => [
    safeFileName(styleFileName) && path.join(uploadsDir, 'css', safeFileName(styleFileName)),
    safeFileName(javascriptFileName) && path.join(uploadsDir, 'js', safeFileName(javascriptFileName)),
  ]).filter(Boolean);
  targets.push(path.join(uploadsDir, 'user', id));
  const removed = await Promise.all(targets.map(removePath));
  return removed.reduce((sum, n) => sum + n, 0);
};

/**
 * Removes everything this API keeps about an account (docs/Auth-v2.md §4.3). The identity
 * provider calls it when an account is deleted. Running it again does no harm.
 *
 * This includes the account's record in the old `users` collection and its one-time links in
 * `account_tokens`. Those stay in the database for every other account (jp.6yuwei.com
 * docs/data.md §5); a deleted account's copy goes, so its address, password hash and details
 * are really gone and moving the old accounts again cannot bring it back.
 */
const eraseAccount = async (sub, { uploadsDir = UPLOADS_DIR } = {}) => {
  const id = String(sub);
  const objectId = new mongoose.Types.ObjectId(id);
  const db = mongoose.connection;
  const fields = { styleFileName: 1, javascriptFileName: 1 };
  const owned = await Component.find({ userId: objectId }, fields).lean();
  const files = await removeFiles(id, owned, uploadsDir);
  const [
    entries, shares, saves, components, transitions, profiles, sessions, users, tokens,
  ] = await Promise.all([
    BpEntry.deleteMany({ owner: id }),
    BpShare.deleteMany({ owner: id }),
    StudioSave.deleteMany({ _id: id }),
    Component.deleteMany({ userId: objectId }),
    UserTransition.deleteMany({ userId: objectId }),
    UserProfile.deleteMany({ _id: objectId }),
    WebSession.deleteMany({ sub: id }),
    db.collection('users').deleteMany({ _id: objectId }),
    db.collection('account_tokens').deleteMany({ userId: objectId }),
  ]);
  return {
    bp_entries: entries.deletedCount,
    bp_shares: shares.deletedCount,
    studio_saves: saves.deletedCount,
    components: components.deletedCount,
    usertransitions: transitions.deletedCount,
    user_profiles: profiles.deletedCount,
    web_sessions: sessions.deletedCount,
    users: users.deletedCount,
    account_tokens: tokens.deletedCount,
    files,
  };
};

module.exports = { eraseAccount };
