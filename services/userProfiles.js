const mongoose = require('mongoose');
const UserProfile = require('../models/userProfile');

const INITIAL_BALANCE = 30;

/** Creates the profile on first sign-in and refreshes the display copy every time. */
const recordSignIn = async (sub, { name, email, picture } = {}) => {
  if (!mongoose.isValidObjectId(sub)) return null;
  return UserProfile.findOneAndUpdate(
    { _id: sub },
    {
      $set: {
        'display.name': name ?? null,
        'display.email': email ?? null,
        'display.picture': picture ?? null,
        'display.updatedAt': new Date(),
      },
      $setOnInsert: { balance: INITIAL_BALANCE, favoriteComponents: [] },
    },
    { upsert: true, returnDocument: 'after' },
  );
};

/** The profile of a signed-in account, created with the starting points when missing. */
const ensureProfile = async (sub) => UserProfile.findOneAndUpdate(
  { _id: sub },
  { $setOnInsert: { balance: INITIAL_BALANCE, favoriteComponents: [] } },
  { upsert: true, returnDocument: 'after' },
);

module.exports = { INITIAL_BALANCE, ensureProfile, recordSignIn };
