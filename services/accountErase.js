const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const StudioSave = require('../models/studioSave');
const { UPLOADS_DIR } = require('./uploadFiles');

/**
 * What this API removes when the identity provider deletes an account (docs/Auth-v2.md §4.3):
 * - the Nihongo Studio save, the only app data that must go with the account
 * - the account itself as the old sign-in kept it: its record in the old `users` collection, its
 *   one-time links in `account_tokens` and its old profile pictures (uploads/user/<id>). Other
 *   accounts' old records stay (jp.6yuwei.com docs/data.md §5); this one goes, so its address and
 *   password hash are really gone and moving the old accounts again cannot bring it back.
 *
 * Everything else (blood pressure records, components, points, favorites) stays as it is
 * (decided 2026-11-22). Running it again does no harm.
 */
const eraseAccount = async (sub, { uploadsDir = UPLOADS_DIR } = {}) => {
  const id = String(sub);
  const objectId = new mongoose.Types.ObjectId(id);
  const db = mongoose.connection;
  const pictures = path.join(uploadsDir, 'user', id);
  const hadPictures = await fs.access(pictures).then(() => true, () => false);
  await fs.rm(pictures, { recursive: true, force: true });
  const [saves, users, tokens] = await Promise.all([
    StudioSave.deleteMany({ _id: id }),
    db.collection('users').deleteMany({ _id: objectId }),
    db.collection('account_tokens').deleteMany({ userId: objectId }),
  ]);
  return {
    studio_saves: saves.deletedCount,
    users: users.deletedCount,
    account_tokens: tokens.deletedCount,
    pictures: hadPictures ? 1 : 0,
  };
};

module.exports = { eraseAccount };
