const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const guessAICanvasController = require('../controllers/guessai_canvas');

// multer 設定
const guessAICanvasStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(path.join(__dirname, '../uploads/guessai_canvas/img'))) {
        fs.mkdirSync(path.join(__dirname, '../uploads/guessai_canvas/img'), { recursive: true });
      }
      const dest = path.join(__dirname, '../uploads/guessai_canvas/img');
      cb(null, dest);
    } catch (err) {
      console.error(err);
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      const dest = path.join(__dirname, '../uploads/guessai_canvas/img');
      const ext = path.extname(file.originalname);
      const basename = Date.now();
      let i = 0;
      let filename = `${basename}${ext}`;
      filename = Buffer.from(filename, 'latin1').toString('utf8');
      const generateFilename = () => {
        fs.access(path.join(dest, filename), (err) => {
          if (err) {
            cb(null, filename);
          } else {
            i += 1;
            filename = `${basename}_${i}${ext}`;
            filename = Buffer.from(filename, 'latin1').toString('utf8');
            generateFilename();
          }
        });
      };
      generateFilename();
    } catch (err) {
      console.error(err);
      cb(err, null);
    }
  },
});

/**
 * 如果文件不是圖片，則返回錯誤。否則，調用回調函數。
 * @param req - HTTP 請求對象。
 * @param file - 剛上傳的文件。
 * @param cb - 回調函數。
 */
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image')) {
    console.log('Not an image!');
    req.fileError = 'Not an image! Please upload an image.';
    cb(null, false);
  }
  cb(null, true);
};

const upload = multer({
  storage: guessAICanvasStorage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 }, // 5MB
  encoding: 'utf-8',
});

router.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

router.get('/user_photo/:filename/', guessAICanvasController.getUserPhoto);
router.post('/simple_user/', upload.single('photo'), guessAICanvasController.createSimpleUser);
router.get('/simple_user/', guessAICanvasController.getSimpleUser);
router.get('/msg_list/', guessAICanvasController.getMsgList);
router.post('/theme/', guessAICanvasController.createTheme);
router.get('/canvas/', helmet(
  {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  },
), guessAICanvasController.getCanvas);
router.get('/ranking/', guessAICanvasController.getRanking);

module.exports = router;
