const express = require('express');
const { requireUser } = require('../middlewares/authenticate');
const { ensureProfile } = require('../services/userProfiles');

const router = express.Router();

// What this API keeps about the caller (docs/Auth-v2.md §4.1). Name and picture belong to the
// identity provider; `display` is the copy taken at the last sign-in
router.get('/', requireUser({ scope: 'studio' }), async (req, res, next) => {
  try {
    const profile = await ensureProfile(req.auth.sub);
    res.json({
      sub: req.auth.sub,
      balance: profile.balance,
      favoriteCount: profile.favoriteComponents.length,
      display: {
        name: profile.display?.name ?? null,
        email: profile.display?.email ?? null,
        picture: profile.display?.picture ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
