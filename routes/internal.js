const express = require('express');
const mongoose = require('mongoose');
const { requireInternal } = require('../middlewares/authenticate');
const { eraseAccount } = require('../services/accountErase');

const router = express.Router();

// Only the identity provider, with its own client credentials token (docs/Auth-v2.md §4.3)
router.use(requireInternal('accounts.erase'));

router.post('/accounts/:sub/erase', async (req, res, next) => {
  const { sub } = req.params;
  if (!mongoose.isValidObjectId(sub)) return res.status(400).json({ error: 'invalid_request' });
  try {
    return res.json({ sub, erased: await eraseAccount(sub) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
