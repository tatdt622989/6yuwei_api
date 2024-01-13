/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
// const nodemailer = require('nodemailer');
const Contact = require('../models/contact');
const { requireAdmin } = require('../middlewares/auth');
const contactController = require('../controllers/contact');

const upload = multer();

// 表單提交
router.post('/', upload.none(), contactController.submitForm);

// 列出資料(有權限)
router.get('/admin/', requireAdmin, contactController.getList);

// 刪除多筆資料(有權限)
router.post('/admin/delete/', requireAdmin, contactController.deleteList);

module.exports = router;
