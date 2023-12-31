const express = require('express');

const router = express.Router();

const guessAICanvasController = require('../controllers/guessai_canvas');

router.get('/', (req, res) => {
  res.json({ message: 'Hello World!' });
});

module.exports = router;
