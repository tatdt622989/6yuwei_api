const { DictWord, DictWordHistory } = require('../models/dictWord');
const { buildWord, DictWordError, LEVELS } = require('../services/dictWords');
const { toHiragana, romajiKey } = require('../services/dictWordKeys');
const { escapeRegex } = require('../services/text');

const LIST_FIELDS = 'readings romaji level levels pos verbClass meanings categories exampleCount formCount quality.flags revision updatedAt';
const editorOf = (req) => ({ userId: String(req.user._id), username: req.user.username });

const guard = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof DictWordError) {
      res.status(400).json({ error: error.message, details: error.details });
      return;
    }
    if (error.code === 121) {
      res.status(400).json({ error: 'the database rejected this document' });
      return;
    }
    console.error('dict word request failed:', error.message);
    res.status(500).json({ error: 'db error' });
  }
};

/** Reads the revision the editor started from. Without it, one editor could overwrite another. */
function revisionOf(req, res) {
  const revision = Number(req.body?.revision ?? req.query.revision);
  if (Number.isInteger(revision) && revision > 0) return revision;
  res.status(400).json({ error: 'revision is required' });
  return null;
}

const conflict = async (res, id) => {
  const current = await DictWord.findById(id).select('revision').lean();
  res.status(409).json({ error: 'someone else changed this word', currentRevision: current?.revision ?? null });
};

const list = guard(async (req, res) => {
  const filter = {};
  const { q, level, flag } = req.query;
  if (typeof q === 'string' && q.trim()) {
    const text = q.trim();
    const key = /^[a-zA-Zāīūēōâîûêô' -]+$/.test(text) ? romajiKey(text) : toHiragana(text);
    filter.$or = [
      { searchKeys: { $regex: `^${escapeRegex(key)}` } },
      { searchKeys: { $regex: `^${escapeRegex(text)}` } },
      { meanings: text },
    ];
  }
  if (LEVELS.includes(level)) filter.levelRank = LEVELS.indexOf(level) + 1;
  if (typeof flag === 'string' && flag) filter['quality.flags'] = flag;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const [items, total] = await Promise.all([
    DictWord.find(filter).select(LIST_FIELDS).sort({ levelRank: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    DictWord.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

const get = guard(async (req, res) => {
  const word = await DictWord.findById(req.params.id).lean();
  if (!word) {
    res.status(404).json({ error: 'word not found' });
    return;
  }
  res.json(word);
});

const create = guard(async (req, res) => {
  const id = typeof req.body?._id === 'string' ? req.body._id.trim() : '';
  const word = buildWord(req.body, id, null);
  if (await DictWord.exists({ _id: id })) {
    res.status(409).json({ error: 'this spelling already exists' });
    return;
  }
  const now = new Date();
  const editor = editorOf(req);
  const next = { ...word, revision: 1, createdAt: now, updatedAt: now, updatedBy: editor };
  await DictWordHistory.create({ wordId: id, action: 'create', revision: 1, editor, after: next });
  await DictWord.create(next);
  res.status(201).json(next);
});

/** History goes first, so an edit is never saved without a record. A failed edit removes its history row. */
const update = guard(async (req, res) => {
  const revision = revisionOf(req, res);
  if (revision === null) return;
  const { id } = req.params;
  const existing = await DictWord.findById(id).lean();
  if (!existing) {
    res.status(404).json({ error: 'word not found' });
    return;
  }
  if (existing.revision !== revision) {
    await conflict(res, id);
    return;
  }
  const editor = editorOf(req);
  const next = {
    ...buildWord(req.body, id, existing),
    createdAt: existing.createdAt,
    importBatch: existing.importBatch,
    revision: revision + 1,
    updatedAt: new Date(),
    updatedBy: editor,
  };
  const history = await DictWordHistory.create({ wordId: id, action: 'update', revision: next.revision, editor, before: existing, after: next });
  let matched = 0;
  try {
    ({ matchedCount: matched } = await DictWord.replaceOne({ _id: id, revision }, next));
  } finally {
    if (!matched) await DictWordHistory.deleteOne({ _id: history._id });
  }
  if (!matched) {
    await conflict(res, id);
    return;
  }
  res.json(next);
});

const remove = guard(async (req, res) => {
  const revision = revisionOf(req, res);
  if (revision === null) return;
  const { id } = req.params;
  const existing = await DictWord.findById(id).lean();
  if (!existing) {
    res.status(404).json({ error: 'word not found' });
    return;
  }
  const history = await DictWordHistory.create({ wordId: id, action: 'delete', revision, editor: editorOf(req), before: existing });
  const { deletedCount } = await DictWord.deleteOne({ _id: id, revision });
  if (!deletedCount) {
    await DictWordHistory.deleteOne({ _id: history._id });
    await conflict(res, id);
    return;
  }
  res.status(204).end();
});

const history = guard(async (req, res) => {
  const items = await DictWordHistory.find({ wordId: req.params.id }).sort({ at: -1 }).limit(50).lean();
  res.json({ items });
});

module.exports = { list, get, create, update, remove, history };
