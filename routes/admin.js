const express = require('express');
const { sendUpload } = require('../services/uploadFiles');

const router = express.Router();

// read img and no cache
router.get('/uploads/:filename', (req, res) => {
  sendUpload(res, 'admin/img', req.params.filename);
});

// read need auth img
router.get('/uploads/:id/:filename', (req, res) => {
  const { id, filename } = req.params;
  if (id === req.user.id) {
    sendUpload(res, `user/${id}/img`, filename);
  } else {
    res.status(403).send('Unauthorized');
  }
});

module.exports = router;
