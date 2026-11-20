/*
 * MIG-03: copies points, favorites and a display copy of name and email from the old `users`
 * collection into `user_profiles` (6yuwei_auth/docs/data.md §3.1, §4).
 *
 *   node scripts/migrate-profiles.js --dry-run   report only, write nothing
 *   node scripts/migrate-profiles.js             write, then verify
 *
 * Reads DB_URL and DB_NAME like app.js. Safe to run again: every profile is overwritten from
 * `users`, which wins over profiles created by sign-ins before the run. `users` is only read,
 * and nothing deletes it.
 */
/* eslint-disable no-underscore-dangle */
require('dotenv').config({ quiet: true });
const mongoose = require('mongoose');

const httpsOnly = (value) => (
  typeof value === 'string' && value.startsWith('https://') ? value : null
);

/** The profile for one old user document. */
const profileOf = (user, now = new Date()) => ({
  balance: Number.isFinite(user.balance) ? user.balance : 30,
  favoriteComponents: Array.isArray(user.favoriteComponents) ? user.favoriteComponents : [],
  display: {
    name: user.username ?? null,
    email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : null,
    picture: httpsOnly(user.externalPhoto),
    updatedAt: now,
  },
});

const sameIds = (a = [], b = []) => a.length === b.length
  && a.every((id, i) => String(id) === String(b[i]));

/** Copies every user; returns { users, written }. */
const migrate = async (db, { dryRun = false } = {}) => {
  const users = db.collection('users');
  const profiles = db.collection('user_profiles');
  const total = await users.countDocuments();
  if (dryRun) return { users: total, written: 0 };

  let written = 0;
  const batch = [];
  const flush = async () => {
    if (!batch.length) return;
    const result = await profiles.bulkWrite(batch.splice(0));
    written += result.upsertedCount + result.matchedCount;
  };
  const now = new Date();
  // eslint-disable-next-line no-restricted-syntax
  for await (const user of users.find({}, {
    projection: {
      balance: 1, favoriteComponents: 1, username: 1, email: 1, externalPhoto: 1, createdAt: 1,
    },
  })) {
    const profile = profileOf(user, now);
    batch.push({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: profile,
          $setOnInsert: { createdAt: user.createdAt ?? now },
          $currentDate: { updatedAt: true },
        },
        upsert: true,
      },
    });
    // eslint-disable-next-line no-await-in-loop
    if (batch.length >= 500) await flush();
  }
  await flush();
  return { users: total, written };
};

/** Checks counts, that every user has a profile, and 20 random users field by field. */
const verify = async (db) => {
  const users = db.collection('users');
  const profiles = db.collection('user_profiles');
  const problems = [];
  const userCount = await users.countDocuments();
  const missing = await users.aggregate([
    {
      $lookup: {
        from: 'user_profiles', localField: '_id', foreignField: '_id', as: 'p',
      },
    },
    { $match: { p: { $size: 0 } } },
    { $count: 'n' },
  ]).toArray();
  if (missing[0]?.n) problems.push(`${missing[0].n} users have no profile`);
  const sample = await users.aggregate([{ $sample: { size: 20 } }]).toArray();
  await Promise.all(sample.map(async (user) => {
    const profile = await profiles.findOne({ _id: user._id });
    const expected = profileOf(user);
    const id = String(user._id);
    if (!profile) return problems.push(`${id}: no profile`);
    if (profile.balance !== expected.balance) {
      problems.push(`${id}: balance ${profile.balance} is not ${expected.balance}`);
    }
    if (!sameIds(profile.favoriteComponents, expected.favoriteComponents)) problems.push(`${id}: favorites differ`);
    if (profile.display?.email !== expected.display.email) problems.push(`${id}: email differs`);
    return null;
  }));
  return {
    users: userCount, profiles: await profiles.countDocuments(), sampled: sample.length, problems,
  };
};

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const dbName = process.env.DB_NAME || '6yuwei';
  await mongoose.connect(process.env.DB_URL, { dbName, family: 4 });
  const { db } = mongoose.connection;
  const result = await migrate(db, { dryRun });
  console.log(`${dryRun ? 'dry run: ' : ''}${result.users} users, ${result.written} profiles written`);
  if (!dryRun) {
    const report = await verify(db);
    console.log(JSON.stringify(report, null, 2));
    if (report.problems.length) process.exitCode = 1;
  }
  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { migrate, profileOf, verify };
