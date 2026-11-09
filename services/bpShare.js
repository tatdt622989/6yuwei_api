const crypto = require('crypto');
const BpEntry = require('../models/bpEntry');
const BpShare = require('../models/bpShare');

const DAY = 24 * 60 * 60 * 1000;
const LINK_DAYS = [7, 30, 90];
const VISIBLE_DAYS = 30;
const MAX_READINGS = 500;
const TOKEN_FORMAT = /^[a-f0-9]{64}$/;

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');

const statusOf = async (owner, now = Date.now()) => {
  const share = await BpShare.findOne({ owner, expiresAt: { $gt: new Date(now) } }).lean();
  return share ? { active: true, expiresAt: share.expiresAt.getTime() } : { active: false };
};

/** Replaces any earlier link, so the old one stops working. The token cannot be shown again. */
const createLink = async (owner, days, now = Date.now()) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now + days * DAY);
  await BpShare.findOneAndUpdate(
    { owner },
    { $set: { tokenHash: hashOf(token), expiresAt } },
    { upsert: true },
  );
  return { token, expiresAt: expiresAt.getTime() };
};

const stopLink = (owner) => BpShare.deleteOne({ owner });

/** What a family link may show. Medication, tags, notes and names stay out of this list. */
const visibleReading = ({ data }) => ({
  takenAt: data.takenAt,
  systolic: data.systolic,
  diastolic: data.diastolic,
  pulse: data.pulse ?? null,
});

/** The diary behind a link, or null when the link is unknown or expired. */
const sharedDiary = async (token, now = Date.now()) => {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
  const share = await BpShare.findOne({
    tokenHash: hashOf(token),
    expiresAt: { $gt: new Date(now) },
  }).lean();
  if (!share) return null;

  const { owner } = share;
  const [rows, settings] = await Promise.all([
    BpEntry.find({
      owner,
      kind: 'reading',
      deleted: false,
      'data.takenAt': { $gte: now - VISIBLE_DAYS * DAY },
    })
      .sort({ 'data.takenAt': -1 })
      .limit(MAX_READINGS)
      .lean(),
    BpEntry.findOne({ owner, kind: 'settings', deleted: false }).lean(),
  ]);
  return {
    expiresAt: share.expiresAt.getTime(),
    standard: settings?.data?.standard ?? 'tw2022',
    readings: rows.reverse().map(visibleReading),
  };
};

module.exports = {
  LINK_DAYS,
  createLink,
  sharedDiary,
  statusOf,
  stopLink,
  visibleReading,
};
