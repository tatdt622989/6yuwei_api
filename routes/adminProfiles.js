/* eslint-disable no-underscore-dangle */
const express = require('express');
const mongoose = require('mongoose');
const { requireRole } = require('../middlewares/authenticate');
const UserProfile = require('../models/userProfile');
const UserTransition = require('../models/userTransition');
const { escapeRegex } = require('../services/text');

/*
 * Points management for admins (docs/Auth-v2.md §4.2). Accounts themselves are managed at the
 * identity provider; this API keeps only points and favorites.
 */

const router = express.Router();
router.use(requireRole('admin'));

const MAX_LIMIT = 100;
const MAX_DELTA = 10000;

const summaryOf = (profile) => ({
  sub: String(profile._id),
  balance: profile.balance,
  display: {
    name: profile.display?.name ?? null,
    email: profile.display?.email ?? null,
    picture: profile.display?.picture ?? null,
  },
  updatedAt: profile.updatedAt,
});

router.get('/', async (req, res, next) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const filter = {};
  if (q) {
    const pattern = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ 'display.name': pattern }, { 'display.email': pattern }];
    if (mongoose.isValidObjectId(q)) filter.$or.push({ _id: new mongoose.Types.ObjectId(q) });
  }
  try {
    const [items, total] = await Promise.all([
      UserProfile.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
        .lean(),
      UserProfile.countDocuments(filter),
    ]);
    return res.json({
      items: items.map(summaryOf), page, limit, total,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:sub', async (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params.sub)) return res.status(404).json({ error: 'not_found' });
  try {
    const profile = await UserProfile.findById(req.params.sub).lean();
    if (!profile) return res.status(404).json({ error: 'not_found' });
    const transitions = await UserTransition.find({ userId: profile._id })
      .sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ ...summaryOf(profile), transitions });
  } catch (error) {
    return next(error);
  }
});

router.post('/:sub/balance', async (req, res, next) => {
  const { sub } = req.params;
  const delta = req.body?.delta;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
  if (!mongoose.isValidObjectId(sub)) return res.status(404).json({ error: 'not_found' });
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_DELTA) {
    return res.status(400).json({ error: 'invalid_request', message: `delta must be a non-zero integer up to ${MAX_DELTA}` });
  }
  try {
    // One step, so the balance never goes below zero even with parallel requests
    const profile = await UserProfile.findOneAndUpdate(
      { _id: sub, balance: { $gte: -delta } },
      { $inc: { balance: delta } },
      { returnDocument: 'after' },
    );
    if (!profile) {
      const exists = await UserProfile.exists({ _id: sub });
      return exists
        ? res.status(400).json({ error: 'invalid_balance', message: 'The balance cannot go below zero' })
        : res.status(404).json({ error: 'not_found' });
    }
    await UserTransition.create({
      userId: profile._id, amount: delta, type: 'admin_adjust', reason, actor: req.auth.sub, ip: req.clientIp,
    });
    return res.json({ sub, balance: profile.balance });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
