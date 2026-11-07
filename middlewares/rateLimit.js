const fs = require('fs');
const { getClientIp } = require('./clientIp');

const DAILY_UPLOAD_LIMIT = 5;
const RATE_LIMIT_MESSAGE = `You can upload up to ${DAILY_UPLOAD_LIMIT} images per day from the same IP.`;

const uploadCounters = new Map();

const getTaipeiDateKey = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
}).format(date);

const pruneCounters = (currentDateKey) => {
  Array.from(uploadCounters.keys()).forEach((key) => {
    if (!key.endsWith(`:${currentDateKey}`)) {
      uploadCounters.delete(key);
    }
  });
};

const removeUploadedFile = async (file) => {
  if (!file?.path) {
    return;
  }

  try {
    await fs.promises.unlink(file.path);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(err);
    }
  }
};

const limitDailyImageUploadsByIp = ({
  scope = 'default',
  maxUploads = DAILY_UPLOAD_LIMIT,
} = {}) => async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const dateKey = getTaipeiDateKey();
  pruneCounters(dateKey);

  const ip = req.clientIp || getClientIp(req);
  const counterKey = `${scope}:${ip}:${dateKey}`;
  const currentCount = uploadCounters.get(counterKey) || 0;

  if (currentCount >= maxUploads) {
    await removeUploadedFile(req.file);
    return res.status(429).send(RATE_LIMIT_MESSAGE);
  }

  uploadCounters.set(counterKey, currentCount + 1);
  return next();
};

const requestWindows = new Map();

/**
 * Fixed-window limit per IP, kept in memory. It resets when the process restarts.
 * keyOf narrows the count to one value per IP, such as one account.
 */
const limitRequestsByIp = ({
  scope, maxRequests, windowMs, keyOf,
}) => (req, res, next) => {
  const now = Date.now();
  if (requestWindows.size > 10000) {
    requestWindows.forEach((entry, key) => {
      if (entry.resetAt <= now) requestWindows.delete(key);
    });
  }

  const key = `${scope}:${req.clientIp || getClientIp(req)}:${keyOf ? keyOf(req) : ''}`;
  const entry = requestWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    requestWindows.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (entry.count >= maxRequests) {
    return res.status(429).json({ error: 'too many requests' });
  }
  entry.count += 1;
  return next();
};

module.exports = {
  DAILY_UPLOAD_LIMIT,
  RATE_LIMIT_MESSAGE,
  limitDailyImageUploadsByIp,
  limitRequestsByIp,
  removeUploadedFile,
};
