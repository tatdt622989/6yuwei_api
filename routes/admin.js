const express = require('express');
const { sendUpload } = require('../services/uploadFiles');

const router = express.Router();

// read img and no cache
router.get('/uploads/:filename', (req, res) => {
  sendUpload(res, 'admin/img', req.params.filename);
});

module.exports = router;
