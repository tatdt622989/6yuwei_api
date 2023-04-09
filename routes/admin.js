const express = require('express');
const path = require('path');

const router = express.Router({ strict: true });

// read img
router.get('/uploads/:filename/', (req, res) => {
  const { filename } = req.params;
  const imgPath = path.resolve('uploads', 'admin', 'img', filename);
  res.sendFile(imgPath);
});

module.exports = router;
