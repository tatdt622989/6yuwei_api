const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router({ strict: true });

// read img
router.get('/uploads/:filename/', (req, res) => {
  const { filename } = req.params;
  const imgPath = path.resolve('uploads', 'admin', 'img', filename);
  res.sendFile(imgPath);
});

// get file info
router.get('/uploads/:filename/info', (req, res) => {
  const { filename } = req.params;
  fs.stat(path.resolve('uploads', 'admin', 'img', filename), (err, stats) => {
    if (err) {
      return res.json({
        code: 500,
        msg: 'File not found',
      });
    }
    return res.json({
      code: 200,
      msg: 'Successful get file info',
      size: stats.size,
      type: stats.isFile() ? 'file' : 'folder',
      ext: path.extname(filename),
    });
  });
});

module.exports = router;
