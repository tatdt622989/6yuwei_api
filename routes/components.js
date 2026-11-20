/* eslint-disable no-underscore-dangle */
const express = require('express');
const helmet = require('helmet');

const router = express.Router();
const multer = require('multer');

const upload = multer();
const { requireRole, requireUser: signedIn } = require('../middlewares/authenticate');

const requireUser = signedIn();
const requireAdmin = requireRole('admin');
const { limitRequestsByIp } = require('../middlewares/rateLimit');
const componentsController = require('../controllers/components');

const limitComponentAI = limitRequestsByIp({ scope: 'component-ai', maxRequests: 30, windowMs: 60 * 60 * 1000 });

// Every generation costs money, so it stays off unless COMPONENT_AI_ENABLED is "true"
const requireComponentAI = (req, res, next) => {
  if (process.env.COMPONENT_AI_ENABLED === 'true') {
    return next();
  }
  return res.status(503).send('The component generator is turned off.');
};

const frontendDomain = process.env.FRONTEND_DOMAIN;
const apiDomain = process.env.API_DOMAIN;

// 讀取css檔案
router.get('/css/:filename/', helmet({
  contentSecurityPolicy: {
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xssFilter: true,
}), componentsController.readCSSFile);

// 讀取元件類型封面
router.get('/types/cover/:filename', helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
    },
  },
}), componentsController.readTypeCover);

// 使用gpt-4生成元件
router.post('/generate/', requireComponentAI, requireUser, limitComponentAI, upload.none(), componentsController.generateComponent);

// 根據元件ID和prompt來修改已生成元件的樣式
router.post('/generate/update/', requireComponentAI, requireUser, limitComponentAI, upload.none(), componentsController.updateComponent);

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
      imgSrc: ["'self'", 'data:', apiDomain, frontendDomain],
    },
  },
  originAgentCluster: false,
}), componentsController.getIframeHTML);

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
