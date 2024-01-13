/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const { requireAdmin } = require('../middlewares/auth');
const memberController = require('../controllers/members');

// 取得會員資料
router.get('/', requireAdmin, memberController.getData);

// 更新會員資料
router.put('/:id', requireAdmin, memberController.updateData);

// 刪除會員資料
router.delete('/:id', requireAdmin, memberController.deleteData);

module.exports = router;
