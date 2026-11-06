const express = require('express');
const { requireAdmin } = require('../middlewares/auth');
const dictWords = require('../controllers/dictWords');

const router = express.Router();

// Every route is for admins. verifyToken in app.js has already identified the user
router.use(requireAdmin);

router.get('/', dictWords.list);
router.post('/', dictWords.create);
router.get('/:id', dictWords.get);
router.put('/:id', dictWords.update);
router.delete('/:id', dictWords.remove);
router.get('/:id/history', dictWords.history);

module.exports = router;
