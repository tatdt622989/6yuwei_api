/* eslint-disable no-underscore-dangle */
const express = require('express');
const helmet = require('helmet');
// const path = require('path');

const router = express.Router();
const multer = require('multer');

const upload = multer();
const { requireUser, requireAdmin } = require('../middlewares/auth');
const componentsController = require('../controllers/components');

// multer 設定
// const componentStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     try {
//       const dest = path.join(__dirname, '../uploads/component_img');
//       cb(null, dest);
//     } catch (err) {
//       console.error(err);
//       cb(err, null);
//     }
//   },
//   filename: (req, file, cb) => {
//     try {
//       const ext = path.extname(file.originalname);
//       const { componentId } = req.body;
//       let filename = `${componentId}${ext}`;
//       filename = Buffer.from(filename, 'latin1').toString('utf8');
//       cb(null, filename);
//     } catch (err) {
//       console.error(err);
//       cb(err, null);
//     }
//   },
// });

/**
 * 如果文件不是圖片，則返回錯誤。否則，調用回調函數。
 * @param req - HTTP 請求對象。
 * @param file - 剛上傳的文件。
 * @param cb - 回調函數。
 */
// const fileFilter = (req, file, cb) => {
//   if (!file.mimetype.startsWith('image')) {
//     console.log('Not an image!');
//     req.fileError = 'Not an image! Please upload an image.';
//     cb(null, false);
//   }
//   cb(null, true);
// };

// const uploadImg = multer({
//   storage: componentStorage,
//   fileFilter,
//   limits: { fileSize: 1024 * 1024 * 10 },
//   encoding: 'utf-8',
// });

const frontendDomain = process.env.FRONTEND_DOMAIN;
const apiDomain = process.env.API_DOMAIN;

// 讀取css檔案
router.get('/css/:filename/', helmet({
  contentSecurityPolicy: {
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xssFilter: true,
}), componentsController.readCSSFile);

// 讀取元件截圖
// router.get('/screenshot/:filename', helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'", 'http://localhost:3000'],
//     },

//   },
//   xssFilter: true,
// }), componentsController.readScreenshot);

// 讀取元件類型封面
router.get('/types/cover/:filename', helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
    },
  },
}), componentsController.readTypeCover);

// 使用gpt-4生成元件
router.post('/generate/', requireUser, upload.none(), componentsController.generateComponent);

// 根據元件ID和prompt來修改已生成元件的樣式
router.post('/generate/update/', requireUser, upload.none(), componentsController.updateComponent);

// 建立元件類型
router.post('/admin/types/', requireAdmin, upload.none(), componentsController.createComponentType);

// 取得元件類型
router.get('/types/', componentsController.getComponentTypes);

// 取得元件
router.get('/', componentsController.getComponents);

// 取得元件(使用者)
router.get('/user/', requireUser, componentsController.getUserComponents);

// iframe html sandbox
router.get('/sandbox/', helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", apiDomain, frontendDomain],
      frameAncestors: ["'self'", frontendDomain],
      styleSrc: ["'self'", "'unsafe-inline'", apiDomain],
      styleSrcElem: ["'self'", "'unsafe-inline'", apiDomain],
    },
  },
  originAgentCluster: false,
}), componentsController.getIframeHTML);

// 上傳元件截圖
// router.post('/screenshot/', requireUser,
// uploadImg.single('screenshot'), componentsController.uploadScreenshot);

// 將元件加入最愛，如果已經加入則移除
router.post('/favorites/', requireUser, upload.none(), componentsController.addFavorite);

// 將元件從最愛移除
router.delete('/favorites/:id/', requireUser, componentsController.deleteFavorite);

// 取得使用者所有最愛元件
router.get('/favorites/', requireUser, componentsController.getFavoriteComponents);

// 取得使用者所有最愛元件id
router.get('/favorites/id/', requireUser, componentsController.getFavoriteComponentIds);

// 刪除元件
router.delete('/:id/', requireUser, componentsController.deleteComponent);

// 取得特定元件
router.get('/:id/', componentsController.getComponent);

module.exports = router;
