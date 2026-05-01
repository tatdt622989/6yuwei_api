const express = require('express');
const ReisuiCode = require('../models/reisuiCode');

const router = express.Router();

const PLUGIN_ACCESS_TOKEN = '9WRdPWsaF3GSyL29ynPgsS5kJfaTPLdPK77wngGuPYmZVSDLfu';
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000;
const SERIAL_FIELDS = (process.env.REISUI_CODE_FIELDS || 'serial,code,serialNumber,number')
  .split(',')
  .map((field) => field.trim())
  .filter(Boolean);
const PLAYER_ID_FIELDS = ['playerId', 'playerUuid', 'uuid'];
const failedAttemptsByPlayer = new Map();

const getSerialValue = (source = {}) => {
  const rawValue = SERIAL_FIELDS
    .map((field) => source[field])
    .find((value) => value !== undefined && value !== null);

  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  return String(rawValue).trim();
};

const buildLookupFilter = (serial) => ({
  $or: SERIAL_FIELDS.map((field) => ({ [field]: serial })),
});

const getPlayerIdValue = (source = {}) => {
  const rawValue = PLAYER_ID_FIELDS
    .map((field) => source[field])
    .find((value) => value !== undefined && value !== null);

  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  return String(rawValue).trim();
};

const getAttemptKey = (req) => {
  const playerId = getPlayerIdValue(req.body);
  if (playerId) {
    return playerId;
  }

  return getPlayerIdValue(req.query);
};

const resetLookupAttempt = (attemptKey) => {
  if (attemptKey) {
    failedAttemptsByPlayer.delete(attemptKey);
  }
};

const registerFailedLookupAttempt = (attemptKey) => {
  if (!attemptKey) {
    return null;
  }

  const now = Date.now();
  const state = failedAttemptsByPlayer.get(attemptKey);

  if (state?.lockedUntil && state.lockedUntil > now) {
    return state;
  }

  const nextFailures = (state?.failures || 0) + 1;
  const nextState = {
    failures: nextFailures,
      lockedUntil: nextFailures >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null,
  };

  failedAttemptsByPlayer.set(attemptKey, nextState);
  return nextState;
};

const requirePluginToken = (req, res, next) => {
  const token = req.get('X-Reisui-Token');
  if (token !== PLUGIN_ACCESS_TOKEN) {
    return res.status(403).json({ result: 'forbidden' });
  }

  return next();
};

const ensureLookupAllowed = (req, res, next) => {
  const attemptKey = getAttemptKey(req);
  if (!attemptKey) {
    return res.status(400).json({ result: 'failed' });
  }

  const now = Date.now();
  const state = failedAttemptsByPlayer.get(attemptKey);

  if (state?.lockedUntil && state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      result: 'failed',
      retryAfterSeconds,
    });
  }

  if (state?.lockedUntil && state.lockedUntil <= now) {
    failedAttemptsByPlayer.delete(attemptKey);
  }

  return next();
};

router.get('/', requirePluginToken, ensureLookupAllowed, async (req, res) => {
  const serial = getSerialValue(req.query);

  if (!serial) {
    return res.status(400).json({ result: 'failed' });
  }

  try {
    const code = await ReisuiCode.findOne(buildLookupFilter(serial)).lean();
    const attemptKey = getAttemptKey(req);

    if (!code) {
      const attemptState = registerFailedLookupAttempt(attemptKey);

      if (attemptState?.lockedUntil) {
        const retryAfterSeconds = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          result: 'failed',
          retryAfterSeconds,
        });
      }

      return res.status(404).json({ result: 'failed' });
    }

    resetLookupAttempt(attemptKey);
    return res.json(code);
  } catch (err) {
    console.log(`reisui code lookup failed: ${err.message}`);
    return res.status(500).json({ result: 'failed' });
  }
});

router.post('/use/', requirePluginToken, ensureLookupAllowed, async (req, res) => {
  const serial = getSerialValue(req.body);
  const attemptKey = getAttemptKey(req);

  if (!serial) {
    return res.status(400).json({ result: 'failed' });
  }

  try {
    const filter = buildLookupFilter(serial);
    const updatedCode = await ReisuiCode.findOneAndUpdate(
      {
        ...filter,
        used: { $ne: true },
      },
      {
        $set: { used: true },
      },
      {
        new: true,
      },
    ).lean();

    if (updatedCode) {
      resetLookupAttempt(attemptKey);
      return res.json({
        result: 'success',
        ...updatedCode,
      });
    }

    const existingCode = await ReisuiCode.findOne(filter).select('used').lean();

    if (!existingCode) {
      const attemptState = registerFailedLookupAttempt(attemptKey);

      if (attemptState?.lockedUntil) {
        const retryAfterSeconds = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
        res.set('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          result: 'failed',
          retryAfterSeconds,
        });
      }

      return res.status(404).json({ result: 'failed' });
    }

    resetLookupAttempt(attemptKey);
    return res.status(409).json({ result: 'already_used' });
  } catch (err) {
    console.log(`reisui code use failed: ${err.message}`);
    return res.status(500).json({ result: 'failed' });
  }
});

module.exports = router;
