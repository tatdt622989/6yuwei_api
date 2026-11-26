const express = require('express');

/*
 * Addresses the apps used before identity v2 that a phone may still open from an old copy of the
 * app (a home-screen bp keeps its old page until it is closed). They lead to the new sign-in
 * instead of ending on a JSON error.
 */
const createLegacyRedirects = () => {
  const router = express.Router();
  // Old bp "Sign in with Google": a top-level visit, so send it to the identity center's sign-in
  router.get(['/bp/google', '/bp/google/'], (req, res) => {
    res.redirect(302, '/session/login?app=bp&return=%2F');
  });
  return router;
};

module.exports = { createLegacyRedirects };
