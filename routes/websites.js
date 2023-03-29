const express = require('express');

const router = express.Router({ strict: true });
const multer = require('multer');
const path = require('path');

// models
const User = require('../models/user');
const Website = require('../models/website');
const Photos = require('../models/photos');

// multer 設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../upload'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
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
    cb(new Error('Not an image! Please upload an image.'), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 1024 * 1024 * 5 } });

// 上傳圖片(有權限)
router.post('/admin/photo/', upload.single('file'), async (req, res) => {
  if (!req.body || !req.body.websiteId) {
    return res.json({
      code: 400,
      msg: 'Data is missing and cannot be uploaded',
    });
  }
  const { user } = req;
  const { userId } = user;
  const { websiteId } = req.body;
  const photo = new Photos({
    userId,
    url: req.file.filename,
  });
  await photo.save();
  // eslint-disable-next-line no-underscore-dangle
  const photoId = photo._id;

  try {
    await Website.findOneAndUpdate(
      { _id: websiteId },
      { $push: { photos: photoId } },
    ).exec();
  } catch (err) {
    console.log(err);
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

// 刪除圖片(有權限)
router.delete('/admin/photo/', async (req, res) => {});

// 新增資料(有權限)
router.post('/admin/add/', upload.any(), async (req, res) => {
  if (!req.body || !req.body.title) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }
  const { user } = req;
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

// 查詢資料(有權限)
router.get('/admin/list/', async (req, res) => {
  const { user } = req;
  const { userId } = user;
  if (!req.query.page) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }
  const page = req.query.page || 1;
  const pageSize = 12;
  const skip = (page - 1) * pageSize; // 跳過幾筆
  try {
    const list = await Website.find({ userId })
      .skip(skip)
      .limit(pageSize)
      .sort({ _id: -1 })
      .populate('photos')
      .exec();
    return res.json({
      code: 200,
      msg: 'Successful query',
      list,
    });
  } catch (err) {
    console.log(err);
    return res.json({
      code: 400,
      msg: 'Failed to query',
    });
  }
});

// 更新資料(有權限)
router.put('/admin/update/', upload.any(), async (req, res) => {
  if (!req.body || !req.body.id || !req.body.title) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }
  // const { user } = req;
  // const { userId } = user;
  const {
    id, title, externalLink, textEditor, category,
  } = req.body;
  const update = {
    title,
    externalLink,
    textEditor,
    category,
    updatedAt: Date.now(),
  };
  try {
    const updatedWebsite = await Website.findByIdAndUpdate(id, update, { new: true });
    console.log(id);
    return res.json({
      code: 200,
      msg: 'Successful update',
      data: updatedWebsite,
    });
  } catch (err) {
    console.log(err);
    return res.json({
      code: 400,
      msg: 'Failed to update',
    });
  }
});

// 刪除資料(有權限)
router.delete('/admin/delete/', async (req, res) => {
  if (!req.body || !req.body.id) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }
  const { id } = req.body;
  try {
    const deletedData = await Website.findByIdAndDelete(id);
    const { title } = deletedData;
    return res.json({
      code: 200,
      msg: `Successful delete ${title}`,
    });
  } catch (err) {
    console.log(err);
    return res.json({
      code: 400,
      msg: 'Failed to delete',
    });
  }
});

module.exports = router;
