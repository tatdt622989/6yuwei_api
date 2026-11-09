const express = require('express');
const helmet = require('helmet');
const account = require('../controllers/account');
const { limitRequestsByIp } = require('../middlewares/rateLimit');

const router = express.Router();

// These pages hold one-time links, so they stay out of caches, referrers and other sites' frames
router.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        styleSrc: ["'unsafe-inline'"],
        formAction: ["'self'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  limitRequestsByIp({ scope: 'account-pages', maxRequests: 60, windowMs: 15 * 60 * 1000 }),
);

router.get('/reset-password/', account.resetPage);
router.post('/reset-password/', account.reset);
router.get('/forgot-password/', account.forgotPage);
router.post('/forgot-password/', account.forgot);

module.exports = router;
