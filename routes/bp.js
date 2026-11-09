const express = require('express');
const multer = require('multer');
const { requireAdmin, requireUser } = require('../middlewares/auth');
const { limitRequestsByIp } = require('../middlewares/rateLimit');
const bp = require('../controllers/bp');

const router = express.Router();

const MINUTE = 60 * 1000;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

// verifyToken in app.js has identified the user. Each account reaches only its own diary
router.use(requireUser);

const accountOf = (req) => req.user.id;

const limitSync = limitRequestsByIp({
  scope: 'bp-sync', maxRequests: 240, windowMs: MINUTE, keyOf: accountOf,
});
// Every photo is a request paid for with the owner's key
const limitOcr = limitRequestsByIp({
  scope: 'bp-ocr', maxRequests: 40, windowMs: 60 * MINUTE, keyOf: accountOf,
});

// The photo stays in memory for the length of the request and is never saved
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
});

router.post('/sync/', limitSync, bp.sync);
router.delete('/data/', limitSync, bp.eraseData);
router.get('/share/', limitSync, bp.shareStatus);
router.post('/share/', limitSync, bp.createShare);
router.delete('/share/', limitSync, bp.stopShare);

const receivePhoto = (req, res, next) => {
  photoUpload.single('image')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      res.status(413).json({ error: 'the photo is too large' });
      return;
    }
    next(error);
  });
};

// Other accounts call Claude from their browser with their own key, which never reaches this server
router.post('/ocr/', requireAdmin, limitOcr, receivePhoto, bp.ocr);

module.exports = router;
