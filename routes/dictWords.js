const express = require('express');
const { requireRole } = require('../middlewares/authenticate');
const dictWords = require('../controllers/dictWords');

const router = express.Router();

// Every route is for admins: on the web with a session, in Nihongo Studio with a studio token
router.use(requireRole('admin', { scope: 'studio' }));

router.get('/', dictWords.list);
router.post('/', dictWords.create);
router.get('/:id', dictWords.get);
router.put('/:id', dictWords.update);
router.delete('/:id', dictWords.remove);
router.get('/:id/history', dictWords.history);

module.exports = router;
