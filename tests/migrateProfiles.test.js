/* eslint-disable no-underscore-dangle */
// MIG-03. Needs MongoDB: API_TEST_MONGO_URL=mongodb://127.0.0.1:27017/ npm test
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const mongoose = require('mongoose');
const { migrate, profileOf, verify } = require('../scripts/migrate-profiles');

const url = process.env.API_TEST_MONGO_URL;
let db;

before(async () => {
  if (!url) return;
  await mongoose.connect(url, { dbName: 'api_test_migrate' });
  db = mongoose.connection.db;
  await db.dropDatabase();
});

after(async () => {
  if (!url) return;
  await db.dropDatabase();
  await mongoose.disconnect();
});

test('profileOf keeps points, favorites and a display copy', () => {
  const fav = new mongoose.Types.ObjectId();
  const profile = profileOf({
    balance: 12, favoriteComponents: [fav], username: '小明', email: ' Ming@Example.com ', externalPhoto: 'http://x/y.png',
  });
  assert.equal(profile.balance, 12);
  assert.deepEqual(profile.favoriteComponents, [fav]);
  assert.equal(profile.display.email, 'ming@example.com');
  assert.equal(profile.display.picture, null);
  assert.equal(profileOf({}).balance, 30);
});

test('every user gets a profile once; points that change after the move stay', { skip: !url }, async () => {
  const users = Array.from({ length: 1200 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(), username: `u${i}`, email: `u${i}@example.com`, balance: i % 50, favoriteComponents: [],
  }));
  await db.collection('users').insertMany(users);
  // A sign-in before the migration created a profile with the default points
  await db.collection('user_profiles').insertOne({ _id: users[7]._id, balance: 30, favoriteComponents: [] });

  const dry = await migrate(db, { dryRun: true });
  assert.equal(dry.wouldWrite, 1200);
  assert.equal(dry.written, 0);
  assert.equal(await db.collection('user_profiles').countDocuments(), 1);

  const first = await migrate(db);
  assert.equal(first.writtenIds.length, 1200);
  assert.equal((await db.collection('user_profiles').findOne({ _id: users[7]._id })).balance, 7, 'the old points replace the default');
  const report = await verify(db, first.writtenIds);
  assert.deepEqual(report.problems, []);
  assert.equal(report.profiles, 1200);

  // Points spent after the move: running again leaves them
  await db.collection('user_profiles').updateOne({ _id: users[9]._id }, { $set: { balance: 2 } });
  const second = await migrate(db);
  assert.equal(second.written, 0);
  assert.equal(second.alreadyMigrated, 1200);
  assert.equal((await db.collection('user_profiles').findOne({ _id: users[9]._id })).balance, 2);
  assert.equal(await db.collection('user_profiles').countDocuments(), 1200);
  assert.deepEqual((await verify(db, second.writtenIds)).problems, []);
  // The old data is only read
  assert.equal((await db.collection('users').findOne({ _id: users[9]._id })).balance, 9);
});
