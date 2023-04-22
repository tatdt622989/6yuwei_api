const express = require('express');

const router = express.Router({ strict: true });
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAdmin } = require('../middlewares/auth');

// models
const Website = require('../models/website');
const Photo = require('../models/photos');

// multer 設定
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const dest = path.join(__dirname, '../uploads/admin/img');
      cb(null, dest);
    } catch (err) {
      console.error(err);
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      const dest = path.join(__dirname, '../uploads/admin/img');
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext);
      let i = 0;
      let filename = file.originalname;
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
    cb(new Error('Not an image! Please upload an image.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: adminStorage, fileFilter, limits: { fileSize: 1024 * 1024 * 5 }, encoding: 'utf-8',
});

// 上傳圖片(有權限)
router.post('/admin/photo/', requireAdmin, upload.single('file'), async (req, res) => {
  const { websiteId } = req.body;
  if (!req.body || !websiteId || !req.file) {
    return res.json({
      code: 400,
      msg: 'Data is missing and cannot be uploaded',
    });
  }

  try {
    const website = await Website.findById(websiteId).exec();
    if (!website) {
      return res.json({
        code: 404,
        msg: 'Website not found',
      });
    }
    if (website.photos.length >= 5) {
      return res.json({
        code: 400,
        msg: 'The number of photos cannot exceed 5',
      });
    }

    const photo = new Photo({
      url: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      ext: path.extname(req.file.filename),
    });
    await photo.save();
    const photoId = photo.id;

    website.photos.push(photoId);
    await website.save();

    return res.json({
      code: 200,
      msg: 'Successful upload',
      websiteId,
      url: req.file.filename,
      data: photo,
    });
  } catch (err) {
    return res.json({
      code: 400,
      msg: 'Failed to upload',
    });
  }
});

// 刪除圖片(有權限)
router.delete('/admin/photo/', requireAdmin, async (req, res) => {
  if (!req.body || !req.body.websiteId || !req.body.photoId) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }

  const { websiteId } = req.body;
  const { photoId } = req.body;

  // 刪除圖片資料
  try {
    const website = await Website.findById(websiteId).populate('photos').exec();
    if (!website) {
      return res.json({
        code: 404,
        msg: 'Website not found',
      });
    }

    const photo = website.photos.find((p) => p.id.toString() === photoId);
    if (!photo) {
      return res.json({
        code: 404,
        message: 'Photo not found',
      });
    }

    // 刪除實體圖片
    const imgPath = path.join(__dirname, '../uploads/admin/img', photo.url);
    fs.unlinkSync(imgPath);

    await photo.remove();
    website.photos.pull(photo);
    await website.save();

    return res.json({
      code: 200,
      data: website,
      msg: 'Successful delete',
    });
  } catch (err) {
    console.log(err);
    return res.json({
      code: 500,
      msg: 'Failed to delete',
    });
  }
});

// 新增資料(有權限)
router.post('/admin/add/', requireAdmin, multer().any(), async (req, res) => {
  const { user } = req;
  const { id } = user;

  if (!req.body || !req.body.title) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }

  const website = new Website({
    userId: id,
    title: req.body.title,
    externalLink: req.body.externalLink,
    textEditor: req.body.textEditor,
    category: req.body.category,
    description: req.body.description,
  });
  await website.save();
  return res.json({
    code: 200,
    msg: 'Successful add',
    data: website,
  });
});

// 查詢資料(有權限)
router.get('/admin/list/', requireAdmin, async (req, res) => {
  const { user } = req;
  const { id } = user;

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
    const total = await Website.countDocuments({ userId: id });
    const list = await Website.find({ userId: id })
      .skip(skip)
      .limit(pageSize)
      .sort({ id: -1 })
      .populate('photos')
      .exec();
    return res.json({
      code: 200,
      msg: 'Successful query',
      list,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
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
router.put('/admin/update/', requireAdmin, multer().any(), async (req, res) => {
  if (!req.body || !req.body.id || !req.body.title) {
    return res.json({
      code: 400,
      msg: 'Lack of essential information',
    });
  }
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
router.delete('/admin/delete/', requireAdmin, async (req, res) => {
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

// 查詢資料(無權限)
router.get('/list/', async (req, res) => {
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
    const list = await Website.find({ visible: true })
      .skip(skip)
      .limit(pageSize)
      .sort({ id: -1 })
      .populate('photos')
      .exec();
    return res.json({
      code: 200,
      msg: 'Successful query',
      list,
      pageSize,
      currentPage: page,
      totalPage: Math.ceil(list.length / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.json({
      code: 400,
      msg: 'Failed to query',
    });
  }
});

module.exports = router;
