/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router({ strict: true });
const multer = require('multer');
const Contact = require('../models/contact');

const upload = multer();

router.post('/', upload.none(), async (req, res) => {
  const { email, message } = req.body;
  const token = req.body['g-recaptcha-response'];
  const form = new FormData();
  form.append('secret', process.env.RECAPTCHA_SECRET_KEY);
  form.append('response', token);
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(email)) {
    return res.status(400).send('Invalid email');
  }
  if (!message) {
    return res.status(400).send('Message cannot be empty');
  }
  const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: form,
  });
  if (recaptchaRes.ok) {
    const json = await recaptchaRes.json();
    const { success, score } = json;
    if (!success || score < 0.5) {
      return res.status(403).send('Recaptcha failed');
    }
  } else {
    return res.status(500).send('Recaptcha failed');
  }
  try {
    const contact = new Contact({
      email,
      message,
    });
    await contact.save();
    return res.json({
      msg: 'Successful send',
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to send');
  }
});

module.exports = router;
