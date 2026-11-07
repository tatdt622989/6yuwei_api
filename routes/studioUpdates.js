const express = require('express');
const fs = require('fs');
const path = require('path');

// Signed Nihongo Studio updates. The files live in a mounted folder outside the image,
// never in this repository. Their signatures, not this server, decide what the app installs.
const updatesDir = path.resolve(process.env.STUDIO_UPDATES_DIR || '/data/studio-updates');
const manifest = path.join(updatesDir, 'latest.json');

const router = express.Router();

router.get('/latest.json', (req, res) => {
  res.set('Cache-Control', 'no-store');
  // The updater reads 204 as "nothing to install"; a 404 would show as a failed check
  if (!fs.existsSync(manifest)) return res.sendStatus(204);
  return res.sendFile(manifest);
});

// File names carry the version, so a published file never changes
router.use('/files', express.static(path.join(updatesDir, 'files'), {
  immutable: true,
  maxAge: '1y',
  index: false,
  dotfiles: 'ignore',
}));

router.use((req, res) => res.sendStatus(404));

module.exports = router;
