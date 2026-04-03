const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const INVALID_IMAGE_MESSAGE = 'Only jpg, jpeg, png, gif, and webp images are allowed.';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  return dirPath;
};

const getSafeImageExtension = (originalname = '') => {
  const extension = path.extname(originalname).toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.has(extension) ? extension : '';
};

const imageFileFilter = (req, file, cb) => {
  const mimetype = (file.mimetype || '').toLowerCase();
  const extension = getSafeImageExtension(file.originalname);

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype) || !extension) {
    req.fileError = INVALID_IMAGE_MESSAGE;
    return cb(null, false);
  }

  return cb(null, true);
};

const createImageStorage = ({ destination, filenamePrefix = '' }) => multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const destinationPath = typeof destination === 'function' ? destination(req, file) : destination;
      return cb(null, ensureDirectory(destinationPath));
    } catch (err) {
      console.error(err);
      return cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      const extension = getSafeImageExtension(file.originalname);
      if (!extension) {
        req.fileError = INVALID_IMAGE_MESSAGE;
        return cb(new Error(INVALID_IMAGE_MESSAGE), null);
      }

      const prefix = typeof filenamePrefix === 'function' ? filenamePrefix(req, file) : filenamePrefix;
      const safePrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '');
      const randomSuffix = crypto.randomBytes(8).toString('hex');
      const filename = `${safePrefix ? `${safePrefix}-` : ''}${Date.now()}-${randomSuffix}${extension}`;

      return cb(null, filename);
    } catch (err) {
      console.error(err);
      return cb(err, null);
    }
  },
});

module.exports = {
  INVALID_IMAGE_MESSAGE,
  createImageStorage,
  imageFileFilter,
};
