const express = require('express');
const { limitRequestsByIp } = require('../middlewares/rateLimit');
const bp = require('../controllers/bp');

const router = express.Router();

// Family members open this without an account. The token in the body is the only credential
router.post('/', limitRequestsByIp({
  scope: 'bp-shared', maxRequests: 60, windowMs: 60 * 1000,
}), bp.shared);

module.exports = router;
