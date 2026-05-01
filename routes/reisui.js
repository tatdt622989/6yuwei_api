const express = require('express');
const ReisuiCode = require('../models/reisuiCode');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000;
const SERIAL_FIELDS = (process.env.REISUI_CODE_FIELDS || 'serial,code,serialNumber,number')
  .split(',')
  .map((field) => field.trim())
  .filter(Boolean);
const lookupAttempts = new Map();

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

const resetLookupAttempt = (ip) => {
  if (ip) {
    lookupAttempts.delete(ip);
  }
};

const registerFailedLookupAttempt = (ip) => {
  if (!ip) {
    return null;
  }

  const now = Date.now();
  const state = lookupAttempts.get(ip);

  if (state?.lockedUntil && state.lockedUntil > now) {
    return state;
  }

  const nextFailures = (state?.failures || 0) + 1;
  const nextState = {
    failures: nextFailures,
    lockedUntil: nextFailures >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null,
  };

  lookupAttempts.set(ip, nextState);
  return nextState;
};

const ensureLookupAllowed = (req, res, next) => {
  const ip = req.clientIp || 'unknown';
  const now = Date.now();
  const state = lookupAttempts.get(ip);

  if (state?.lockedUntil && state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((state.lockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      result: 'failed',
      retryAfterSeconds,
    });
  }

  if (state?.lockedUntil && state.lockedUntil <= now) {
    lookupAttempts.delete(ip);
  }

  return next();
};

router.get('/', ensureLookupAllowed, async (req, res) => {
  const serial = getSerialValue(req.query);

  if (!serial) {
    return res.status(400).json({ result: 'failed' });
  }

  try {
    const code = await ReisuiCode.findOne(buildLookupFilter(serial)).lean();

    if (!code) {
      const attemptState = registerFailedLookupAttempt(req.clientIp || 'unknown');

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

    resetLookupAttempt(req.clientIp || 'unknown');
    return res.json(code);
  } catch (err) {
    console.log(`reisui code lookup failed: ${err.message}`);
    return res.status(500).json({ result: 'failed' });
  }
});

router.post('/use/', ensureLookupAllowed, async (req, res) => {
  const serial = getSerialValue(req.body);

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
      resetLookupAttempt(req.clientIp || 'unknown');
      return res.json({
        result: 'success',
        ...updatedCode,
      });
    }

    const existingCode = await ReisuiCode.findOne(filter).select('used').lean();

    if (!existingCode) {
      const attemptState = registerFailedLookupAttempt(req.clientIp || 'unknown');

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

    resetLookupAttempt(req.clientIp || 'unknown');
    return res.status(409).json({ result: 'already_used' });
  } catch (err) {
    console.log(`reisui code use failed: ${err.message}`);
    return res.status(500).json({ result: 'failed' });
  }
});

module.exports = router;
