const express = require('express');
const { requireUser } = require('../middlewares/authenticate');
const studioSave = require('../controllers/studioSave');

const router = express.Router();

// Nihongo Studio calls this with a studio access token. Each account reaches only its own save
router.use(requireUser({ scope: 'studio' }));

router.get('/', studioSave.get);
router.put('/', studioSave.put);
router.delete('/', studioSave.remove);

module.exports = router;
