const express = require('express');
const dictVocabulary = require('../controllers/dictVocabulary');
const { limitRequestsByIp } = require('../middlewares/rateLimit');

const router = express.Router();

// Public, because the app has no login. app.js mounts this before verifyToken.
// Editing stays in routes/dictWords.js
router.use(limitRequestsByIp({ scope: 'dict-vocabulary', maxRequests: 120, windowMs: 60 * 1000 }));

router.get('/stats', dictVocabulary.stats);
router.get('/words', dictVocabulary.words);
router.get('/questions', dictVocabulary.questions);
router.post('/check', dictVocabulary.check);
router.post('/record', dictVocabulary.record);
router.get('/user-stats/:userId', dictVocabulary.userStats);

module.exports = router;
