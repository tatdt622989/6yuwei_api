const express = require('express');

const router = express.Router();

const guessAICanvasController = require('../controllers/guessai_canvas');

router.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

router.post('/simple_user', guessAICanvasController.createSimpleUser);
router.get('/simple_user', guessAICanvasController.getSimpleUser);
router.get('/canvas/', guessAICanvasController.getCanvas);

module.exports = router;
