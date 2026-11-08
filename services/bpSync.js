/* eslint-disable no-underscore-dangle */
const BpEntry = require('../models/bpEntry');
const { parseChange } = require('./bpEntries');

const MAX_CHANGES_PER_REQUEST = 500;
const MAX_ENTRIES_PER_ACCOUNT = 100000;
const PAGE_SIZE = 1000;
// Writes that finish during a pull can carry a slightly older time, so a pull looks back this far.
// Clients keep the newest version of an entry, so seeing one twice changes nothing.
const CURSOR_OVERLAP_MS = 10 * 1000;

const DUPLICATE_KEY = 11000;

/**
 * Saves the valid changes. An entry with a newer stored version matches no row, the upsert then
 * tries to insert a duplicate and MongoDB refuses it, which leaves the newer version in place.
 */
const applyChanges = async (owner, changes, now) => {
  const rejected = [];
  const operations = [];
  changes.forEach((change) => {
    const entry = parseChange(change, now);
    if (!entry) {
      rejected.push({ kind: change?.kind, id: change?.id });
      return;
    }
    const { kind, clientId, ...fields } = entry;
    operations.push({
      updateOne: {
        filter: {
          owner, kind, clientId, clientUpdatedAt: { $lte: fields.clientUpdatedAt },
        },
        update: { $set: { ...fields, syncedAt: new Date(now) } },
        upsert: true,
      },
    });
  });
  if (operations.length === 0) return rejected;

  try {
    await BpEntry.bulkWrite(operations, { ordered: false });
  } catch (error) {
    const failures = error.writeErrors ?? [];
    const onlyStale = failures.length > 0
      && failures.every((failure) => (failure.code ?? failure.err?.code) === DUPLICATE_KEY);
    if (!onlyStale) throw error;
  }
  return rejected;
};

const cursorFilter = (owner, since, after) => {
  if (after) {
    // In the middle of a multi-page pull: continue exactly after the last row of the previous page
    const at = new Date(since);
    return {
      owner,
      $or: [{ syncedAt: { $gt: at } }, { syncedAt: at, _id: { $gt: after } }],
    };
  }
  return since > 0
    ? { owner, syncedAt: { $gte: new Date(since - CURSOR_OVERLAP_MS) } }
    : { owner };
};

/** Entries changed after the cursor, oldest first. `more` is true when another page is waiting. */
const changesSince = async (owner, since, after, now) => {
  const rows = await BpEntry.find(cursorFilter(owner, since, after))
    .sort({ syncedAt: 1, _id: 1 })
    .limit(PAGE_SIZE + 1)
    .lean();
  const more = rows.length > PAGE_SIZE;
  const page = more ? rows.slice(0, PAGE_SIZE) : rows;
  const last = page[page.length - 1];
  return {
    more,
    cursor: more ? last.syncedAt.getTime() : now,
    after: more ? String(last._id) : null,
    changes: page.map((row) => ({
      kind: row.kind,
      id: row.clientId,
      data: row.data,
      deleted: row.deleted,
      updatedAt: row.clientUpdatedAt,
    })),
  };
};

/** Pushes the client's changes, then returns what it has not seen yet. */
const sync = async (owner, { since, after, changes }, now = Date.now()) => {
  let rejected = [];
  if (changes.length > 0) {
    const stored = await BpEntry.countDocuments({ owner });
    if (stored + changes.length > MAX_ENTRIES_PER_ACCOUNT) {
      const error = new Error('entry limit reached');
      error.code = 'ENTRY_LIMIT';
      throw error;
    }
    rejected = await applyChanges(owner, changes, now);
  }
  const page = await changesSince(owner, since, after, now);
  return { ...page, rejected };
};

/**
 * Empties the account's diary but keeps the ids, marked as deleted, so the account's other
 * devices also remove their copies the next time they sync.
 */
const eraseData = async (owner, now = Date.now()) => {
  await BpEntry.updateMany(
    { owner },
    {
      $set: {
        data: null, deleted: true, clientUpdatedAt: now, syncedAt: new Date(now),
      },
    },
  );
};

/** Removes every row of the account, for when the account itself is deleted. */
const removeAccountData = (owner) => BpEntry.deleteMany({ owner: String(owner) });

module.exports = {
  MAX_CHANGES_PER_REQUEST,
  eraseData,
  removeAccountData,
  sync,
};
