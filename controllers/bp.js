const bpSync = require('../services/bpSync');
const bpOcr = require('../services/bpOcr');

const ownerOf = (req) => req.user.id;

const guard = (label, handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    // Never log the request body or the model's answer: they hold health data
    console.error(`bp ${label} request failed:`, error.message);
    res.status(500).json({ error: 'server error' });
  }
};

const OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/;

/** POST /bp/sync/ pushes { changes } and returns what changed after { since, after }. */
const sync = guard('sync', async (req, res) => {
  const { since = 0, after = null, changes = [] } = req.body;
  const validSince = Number.isFinite(since) && since >= 0;
  const validAfter = after === null || (typeof after === 'string' && OBJECT_ID_PATTERN.test(after));
  const validChanges = Array.isArray(changes) && changes.length <= bpSync.MAX_CHANGES_PER_REQUEST;
  if (!validSince || !validAfter || !validChanges) {
    res.status(400).json({ error: 'invalid sync request' });
    return;
  }
  try {
    res.json(await bpSync.sync(ownerOf(req), { since, after, changes }));
  } catch (error) {
    if (error.code !== 'ENTRY_LIMIT') throw error;
    res.status(413).json({ error: 'entry limit reached' });
  }
});

/** DELETE /bp/data/ empties the signed-in account's diary. */
const eraseData = guard('erase', async (req, res) => {
  await bpSync.eraseData(ownerOf(req));
  res.json({ ok: true });
});

const IMAGE_SIGNATURES = [
  { mimeType: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/png', matches: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  {
    mimeType: 'image/webp',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF'
      && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

// Trusts the file's first bytes rather than the type the browser declared
const detectImageType = (buffer) => IMAGE_SIGNATURES
  .find(({ matches }) => matches(buffer))?.mimeType;

/** POST /bp/ocr/ takes a multipart `image` and returns the numbers read from it. */
const ocr = guard('ocr', async (req, res) => {
  if (!bpOcr.isConfigured()) {
    res.status(503).json({ error: 'ocr is not configured' });
    return;
  }
  const mimeType = req.file && detectImageType(req.file.buffer);
  if (!mimeType) {
    res.status(400).json({ error: 'a jpeg, png or webp image is required' });
    return;
  }
  try {
    res.json(await bpOcr.readMonitorPhoto(req.file.buffer, mimeType));
  } catch (error) {
    console.error('bp ocr provider failed:', error.message);
    res.status(502).json({ error: 'ocr provider failed' });
  }
});

module.exports = { eraseData, ocr, sync };
