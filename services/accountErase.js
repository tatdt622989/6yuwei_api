const mongoose = require('mongoose');
const BpEntry = require('../models/bpEntry');
const BpShare = require('../models/bpShare');
const StudioSave = require('../models/studioSave');
const UserProfile = require('../models/userProfile');
const UserTransition = require('../models/userTransition');
const WebSession = require('../models/webSession');
const { Component } = require('../models/component');

/**
 * Removes everything this API keeps about an account (docs/Auth-v2.md §4.3). The identity
 * provider calls it when an account is deleted. Running it again does no harm.
 */
const eraseAccount = async (sub) => {
  const id = String(sub);
  const objectId = new mongoose.Types.ObjectId(id);
  const [entries, shares, saves, components, transitions, profiles, sessions] = await Promise.all([
    BpEntry.deleteMany({ owner: id }),
    BpShare.deleteMany({ owner: id }),
    StudioSave.deleteMany({ _id: id }),
    Component.deleteMany({ userId: objectId }),
    UserTransition.deleteMany({ userId: objectId }),
    UserProfile.deleteMany({ _id: objectId }),
    WebSession.deleteMany({ sub: id }),
  ]);
  return {
    bp_entries: entries.deletedCount,
    bp_shares: shares.deletedCount,
    studio_saves: saves.deletedCount,
    components: components.deletedCount,
    usertransitions: transitions.deletedCount,
    user_profiles: profiles.deletedCount,
    web_sessions: sessions.deletedCount,
  };
};

module.exports = { eraseAccount };
