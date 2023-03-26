const express = require('express');

const router = express.Router({ strict: true });
const multer = require('multer');
const path = require('path');

// models
const User = require('../models/user');
const Website = require('../models/website');
const Photo = require('../models/photo');

// multer 設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// 上傳圖片
router.post('/upload/', upload.single('file'), async (req, res) => {
  const { user } = req;
  if (!user) {
    return res.json({
      code: 403,
      msg: 'Please login first',
    });
  }
  if (req.body && req.body.websiteId) {
    return res.json({
      code: 400,
      msg: 'Data is missing and cannot be uploaded',
    });
  }
  const { userId } = user;
  const { websiteId } = req.body;
  const photo = new Photo({
    userId,
    url: req.file.filename,
  });
  await photo.save();
  // eslint-disable-next-line no-underscore-dangle
  const photoId = photo._id;
  const websiteReq = await Website.findByIdAndUpdate(
    websiteId,
    { $push: { photos: photoId } },
    (err) => {
      if (err) {
        return false;
      }
      return true;
    },
  );

  if (!websiteReq) {
    return res.json({
      code: 400,
      msg: 'Failed to upload',
    });
  }

  return res.json({
    code: 200,
    msg: 'Successful upload',
    websiteId,
    url: req.file.filename,
  });
});

// 新增資料
router.post('/add/', async (req, res) => {
  const { user } = req;
  if (!user) {
    return res.json({
      code: 403,
      msg: '請先登入',
    });
  }
  if (!req.body || !req.body.title) {
    return res.json({
      code: 400,
      msg: '缺少必要資料',
    });
  }
  const { userId } = user;
  const website = new Website({
    userId,
    title: req.body.title,
    externalLink: req.body.externalLink,
    textEditor: req.body.textEditor,
    category: req.body.category,
  });
  await website.save();
  return res.json({
    code: 200,
    msg: '新增成功',
  });
});

module.exports = router;
