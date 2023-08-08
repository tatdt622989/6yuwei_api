const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// read img and no cache
router.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const imgPath = path.resolve('uploads', 'admin', 'img', filename);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(imgPath);
});

// read need auth img
router.get('/uploads/:id/:filename', (req, res) => {
  const { id, filename } = req.params;
  res.set('Cache-Control', 'no-cache');
  if (id === req.user.id) {
    const imgPath = path.resolve('uploads', 'user', id, 'img', filename);
    res.sendFile(imgPath);
  } else {
    res.status(403).send('Unauthorized');
  }
});

// get file info
router.get('/uploads/:filename/info', (req, res) => {
  const { filename } = req.params;
  fs.stat(path.resolve('uploads', 'admin', 'img', filename), (err, stats) => {
    if (err) {
      return res.status(404).send('File not found');
    }
    return res.json({
      msg: 'Successful get file info',
      size: stats.size,
      type: stats.isFile() ? 'file' : 'folder',
      ext: path.extname(filename),
    });
  });
});

module.exports = router;
