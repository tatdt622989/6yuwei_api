const jwt = require('jsonwebtoken');

// model
const GuessAICanvasSimpleUser = require('../models/guessai_canvas');

const createSimpleUser = async (req, res) => {
  const recaptchaToken = req.body['g-recaptcha-response'];
  const form = new FormData();
  form.append('secret', process.env.RECAPTCHA_SECRET_KEY);
  form.append('response', recaptchaToken);
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
  const { name, photo, score } = req.body;

  if (!name) {
    return res.status(400).send('Name is required');
  }

  const simpleUser = new GuessAICanvasSimpleUser({
    name,
    photo,
    score,
  });

  await simpleUser.save().catch((err) => {
    res.status(500).send(`Registration Failure-${err}`);
  });

  // jwt token
  const token = simpleUser.generateAuthToken();

  res.cookie('access_token', token, {
    httpOnly: true, // 只能在伺服器端讀取cookie
    secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
    sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
  });

  return res.json({
    message: 'Registration Success',
    id: simpleUser.id,
  });
};

const getSimpleUser = async (req, res) => {
  // verify token
  const token = req.cookies.access_token;

  if (!token) {
    return res.status(403).send('No token');
  }

  await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
    if (decoded) {
      const simpleUser = await GuessAICanvasSimpleUser.findById(decoded.userId);
      if (!simpleUser) {
        return res.status(403).send('User not found');
      }
      return res.json(simpleUser);
    }
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).send('Login timeout, please login again');
      }
      return res.status(403).send('Please login first');
    }

    return null;
  });

  return null;
};

const getCanvas = async (req, res) => {
  // const { id } = req.params;
  // const canvas = await GuessAICanvas.findById(id);
  // if (!canvas) {
  //   return res.status(404).send('Canvas not found');
  // }
  // return res.json(canvas);
};

module.exports = {
  createSimpleUser,
  getSimpleUser,
  getCanvas,
};
