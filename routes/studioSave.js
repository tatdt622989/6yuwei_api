const express = require('express');
const { requireUser } = require('../middlewares/auth');
const studioSave = require('../controllers/studioSave');

const router = express.Router();

// verifyToken in app.js has identified the user. Each account reaches only its own save
router.use(requireUser);

router.get('/', studioSave.get);
router.put('/', studioSave.put);
router.delete('/', studioSave.remove);

module.exports = router;
