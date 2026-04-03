const fs = require('fs');

const DAILY_UPLOAD_LIMIT = 5;
const RATE_LIMIT_MESSAGE = `You can upload up to ${DAILY_UPLOAD_LIMIT} images per day from the same IP.`;

const uploadCounters = new Map();

const normalizeIp = (ip = '') => (ip.startsWith('::ffff:') ? ip.slice(7) : ip);

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

  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || 'unknown');
  const counterKey = `${scope}:${ip}:${dateKey}`;
  const currentCount = uploadCounters.get(counterKey) || 0;

  if (currentCount >= maxUploads) {
    await removeUploadedFile(req.file);
    return res.status(429).send(RATE_LIMIT_MESSAGE);
  }

  uploadCounters.set(counterKey, currentCount + 1);
  return next();
};

module.exports = {
  DAILY_UPLOAD_LIMIT,
  RATE_LIMIT_MESSAGE,
  limitDailyImageUploadsByIp,
};
