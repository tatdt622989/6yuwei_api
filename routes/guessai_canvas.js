const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const helmet = require('helmet');
const guessAICanvasController = require('../controllers/guessai_canvas');
const { guessAICanvasContentSecurityPolicyDirectives } = require('../config/origins');
const { createImageStorage, imageFileFilter } = require('../middlewares/upload');
const { limitDailyImageUploadsByIp } = require('../middlewares/rateLimit');

const { requireAdmin } = require('../middlewares/auth');

// multer 設定
const guessAICanvasStorage = createImageStorage({
  destination: path.join(__dirname, '../uploads/guessai_canvas/img'),
  filenamePrefix: 'guessai',
});

const upload = multer({
  storage: guessAICanvasStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
  encoding: 'utf-8',
});

const handlePhotoUpload = (req, res, next) => {
  upload.single('photo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send('Image must be 5MB or smaller.');
    }

    if (err) {
      return res.status(400).send(err.message || 'Upload failed');
    }

    return next();
  });
};

const limitGuessAICanvasUploads = limitDailyImageUploadsByIp({
  scope: 'guessai_canvas',
});

router.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

router.get('/user_photo/:filename/', guessAICanvasController.getUserPhoto);
router.post('/simple_user/', handlePhotoUpload, limitGuessAICanvasUploads, guessAICanvasController.createSimpleUser);
router.get('/simple_user/', guessAICanvasController.getSimpleUser);
router.put('/simple_user/', handlePhotoUpload, limitGuessAICanvasUploads, guessAICanvasController.updateSimpleUser);
router.get('/msg_list/', guessAICanvasController.getMsgList);
router.post('/theme/', guessAICanvasController.createTheme);
router.get('/canvas/', helmet(
  {
    contentSecurityPolicy: {
      directives: guessAICanvasContentSecurityPolicyDirectives,
    },
  },
), guessAICanvasController.getCanvas);
router.get('/canvas/:id/', helmet(
  {
    contentSecurityPolicy: {
      directives: guessAICanvasContentSecurityPolicyDirectives,
    },
  },
), guessAICanvasController.getGalleryCanvas);
router.put('/canvas/', guessAICanvasController.updateCanvas);
router.get('/ranking/', guessAICanvasController.getRanking);
router.get('/canvas_list/', guessAICanvasController.getCanvasList);
router.get('/generate/', requireAdmin, guessAICanvasController.forceGenerateCanvas); // 需要有官網會員管理權限才能使用

module.exports = router;
