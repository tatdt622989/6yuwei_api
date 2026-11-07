const StudioSave = require('../models/studioSave');

const guard = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('studio save request failed:', error.message);
    res.status(500).json({ error: 'db error' });
  }
};

const ownerOf = (req) => String(req.user._id);

const get = guard(async (req, res) => {
  const save = await StudioSave.findById(ownerOf(req)).lean();
  if (!save) {
    res.json({ revision: 0, updatedAt: null, data: null });
    return;
  }
  res.json({ revision: save.revision, updatedAt: save.updatedAt, data: JSON.parse(save.data) });
});

/** Replaces the save. `revision` is the one the client merged with, so no device overwrites another. */
const put = guard(async (req, res) => {
  const { revision, data } = req.body || {};
  const isSave = data && typeof data === 'object' && !Array.isArray(data);
  if (!Number.isInteger(revision) || revision < 0 || !isSave) {
    res.status(400).json({ error: 'revision and data are required' });
    return;
  }
  const _id = ownerOf(req);
  const fields = { data: JSON.stringify(data), updatedAt: new Date() };
  const conflict = async () => {
    const current = await StudioSave.findById(_id).select('revision').lean();
    res.status(409).json({
      error: 'the save changed on another device',
      currentRevision: current?.revision ?? 0,
    });
  };
  if (revision === 0) {
    try {
      await StudioSave.create({ _id, revision: 1, ...fields });
      res.json({ revision: 1, updatedAt: fields.updatedAt });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await conflict();
    }
    return;
  }
  const saved = await StudioSave.findOneAndUpdate(
    { _id, revision },
    { $set: fields, $inc: { revision: 1 } },
    { returnDocument: 'after', projection: { revision: 1 } },
  ).lean();
  if (!saved) {
    await conflict();
    return;
  }
  res.json({ revision: saved.revision, updatedAt: fields.updatedAt });
});

const remove = guard(async (req, res) => {
  await StudioSave.deleteOne({ _id: ownerOf(req) });
  res.json({ ok: true });
});

module.exports = { get, put, remove };
