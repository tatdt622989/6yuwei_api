const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

/** The name when it is a plain file name, or null when it could reach another folder. */
const safeFileName = (name) => {
  const value = String(name ?? '');
  const isPlain = value === path.basename(value) && !value.includes('\\') && !value.startsWith('.');
  return value && isPlain ? value : null;
};

/** Sends one file from a folder under uploads/. The name can never leave that folder. */
const sendUpload = (res, folder, name) => {
  const fileName = safeFileName(name);
  if (!fileName) return res.status(404).send('File not found');
  res.set('Cache-Control', 'no-cache');
  return res.sendFile(fileName, { root: path.join(UPLOADS_DIR, folder) }, (err) => {
    if (err && !res.headersSent) res.status(404).send('File not found');
  });
};

module.exports = { safeFileName, sendUpload };
