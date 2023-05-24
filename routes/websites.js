/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const validator = require('validator');
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
  storage: adminStorage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 10 },
  encoding: 'utf-8',
});

// 上傳圖片(有權限)
router.post(
  '/admin/photo/',
  requireAdmin,
  upload.single('file'),
  async (req, res) => {
    const { unitId } = req.body;
    if (!req.body || !unitId || !req.file) {
      return res.status(400).send('Lack of essential information');
    }

    try {
      const website = await Website.findById(unitId).exec();
      if (!website) {
        return res.status(404).send('Website not found');
      }
      if (website.photos.length >= 5) {
        return res.status(400).send('The number of photos cannot exceed 5');
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
        msg: 'Successful upload',
        unitId,
        url: req.file.filename,
        data: photo,
      });
    } catch (err) {
      return res.status(500).send('Failed to upload');
    }
  },
);

// 刪除圖片(有權限)
router.delete('/admin/photo/', requireAdmin, async (req, res) => {
  if (!req.body || !req.body.unitId || !req.body.photoId) {
    return res.status(400).send('Lack of essential information');
  }

  const { unitId } = req.body;
  const { photoId } = req.body;

  // 刪除圖片資料
  try {
    const website = await Website.findById(unitId)
      .populate({
        path: 'photos',
        options: {
          sort: { createdAt: 'desc' },
        },
      })
      .exec();
    if (!website) {
      return res.status(404).send('Website not found');
    }

    const photo = website.photos.find((p) => p.id.toString() === photoId);
    if (!photo) {
      return res.status(404).send('Photo not found');
    }

    // 刪除實體圖片
    const imgPath = path.join(__dirname, '../uploads/admin/img', photo.url);
    fs.unlinkSync(imgPath);

    await photo.remove();
    website.photos.pull(photo);
    await website.save();

    return res.json({
      data: website,
      msg: 'Successful delete',
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to delete');
  }
});

// 新增資料(有權限)
router.post('/admin/list/', requireAdmin, multer().any(), async (req, res) => {
  const { user } = req;
  const { id } = user;

  if (!req.body || !req.body.data || !req.body.data.title) {
    return res.status(400).send('Lack of essential information');
  }

  const { data } = req.body;

  const website = new Website({
    userId: id,
    ...data,
  });
  await website.save();
  return res.json({
    msg: 'Successful add',
    data: website,
  });
});

// 查詢資料(有權限)
router.get('/admin/list/', requireAdmin, async (req, res) => {
  if (!req.query.page) {
    return res.status(400).send('Lack of essential information');
  }
  const page = req.query.page || 1;
  let keyword = req.query.keyword || '';
  keyword = validator.escape(keyword);
  const regex = new RegExp(keyword, 'i');
  const pageSize = 12;
  const skip = (page - 1) * pageSize; // 跳過幾筆
  try {
    const total = await Website.countDocuments({
      $or: [{ title: { $regex: regex } }, { url: { $regex: regex } }],
    });
    const list = await Website.find({
      $or: [{ title: { $regex: regex } }, { url: { $regex: regex } }],
    })
      .skip(skip)
      .limit(pageSize)
      .sort({ createdAt: 'desc' })
      .populate({
        path: 'photos',
        options: {
          sort: { createdAt: 'desc' },
        },
      })
      .exec();
    return res.json({
      msg: 'Successful query',
      list,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

// 更新資料(有權限)
router.put('/admin/list/', requireAdmin, multer().any(), async (req, res) => {
  const { _id } = req.body;
  const { data } = req.body;
  if (!req.body || !data || !_id) {
    return res.status(400).send('Lack of essential information');
  }
  try {
    const updatedWebsite = await Website.findByIdAndUpdate(_id, data, {
      new: true,
    }).populate('photos');
    return res.json({
      msg: 'Successful update',
      data: updatedWebsite,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to update');
  }
});

// 刪除多筆資料(有權限)
router.post('/admin/list/delete/', requireAdmin, async (req, res) => {
  if (!req.body || !req.body.ids) {
    return res.status(400).send('Lack of essential information');
  }
  const { ids } = req.body;

  if (!Array.isArray(ids)) {
    return res.status(400).send('ids must be an array');
  }

  try {
    const deletedData = await Website.deleteMany({ _id: { $in: ids } });
    const { title } = deletedData;
    return res.json({
      msg: `Successful delete ${title}`,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to delete');
  }
});

// 刪除單筆資料(有權限)
router.delete('/admin/list/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const deletedData = await Website.findByIdAndDelete(id);
    const { title } = deletedData;
    return res.json({
      msg: `Successful delete ${title}`,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to delete');
  }
});

// 查詢資料(無權限)
router.get('/list/', async (req, res) => {
  const homepage = !!parseInt(req.query.homepage, 10); // 是否為首頁
  const page = req.query.page || 1;
  const pageSize = req.query.pageSize || 12;
  const skip = (page - 1) * pageSize; // 跳過幾筆
  const sortBy = req.query.sort === 'asc' ? 'asc' : 'desc';
  const category = req.query.category || '';
  const categoryArr = category.split(',')
    .map((item) => validator.escape(item)) // 過濾特殊字元
    .filter((item) => item); // 過濾空字串
  // 查詢條件
  let query = {
    visible: true,
  };
  if (categoryArr.length > 0) {
    query = {
      ...query,
      category: { $in: categoryArr },
    };
  }
  if (req.query.homepage !== undefined) {
    query = {
      ...query,
      homepage,
    };
  }
  try {
    const total = await Website.countDocuments();
    const list = await Website.find(query)
      .skip(skip)
      .limit(pageSize)
      .sort({ createdAt: sortBy })
      .populate({
        path: 'photos',
        options: {
          sort: { createdAt: 'desc' },
        },
      })
      .exec();
    return res.json({
      msg: 'Successful query',
      list,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(list.length / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

// 取得類別(無權限)
router.get('/category/', async (req, res) => {
  try {
    const category = await Website.find({ visible: true }).distinct('category');
    return res.json({
      msg: 'Successful query',
      category,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

// 查詢單筆資料(無權限)
router.get('/:id/', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).send('Lack of essential information');
  try {
    const website = await Website.findById(id).populate('photos');
    return res.json({
      msg: 'Successful query',
      data: website,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

// 取得類別(有權限)
router.get('/admin/category/', requireAdmin, async (req, res) => {
  try {
    const category = await Website.find().distinct('category');
    return res.json({
      msg: 'Successful query',
      category,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

module.exports = router;
