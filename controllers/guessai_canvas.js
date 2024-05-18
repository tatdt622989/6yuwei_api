/* eslint-disable no-underscore-dangle */
const jwt = require('jsonwebtoken');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const xss = require('xss');

const OpenAIAPIKey = process.env.OPENAI_API_KEY2;
const openai = new OpenAI({
  apiKey: OpenAIAPIKey,
});

const apiDomain = process.env.API_DOMAIN;

// model
const {
  GuessAICanvas, SimpleUser, Messages, Theme,
} = require('../models/guessai_canvas');

const createSimpleUser = async (req, res) => {
  const recaptchaToken = req.body.token;
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
  const { name } = req.body;

  if (!name) {
    return res.status(400).send('Name is required');
  }

  const filename = req.file?.filename;

  const simpleUser = new SimpleUser({
    name,
    photo: filename,
    score: 0,
  });

  // jwt token
  const token = simpleUser.generateAuthToken();

  res.cookie('guessai_canvas_access_token', token, {
    httpOnly: true, // 只能在伺服器端讀取cookie
    secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
    sameSite: 'lax', // 避免CSRF攻擊
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
  });

  await simpleUser.save().catch((err) => {
    res.status(500).send(`Registration Failure-${err}`);
  });

  return res.json({
    message: 'Registration Success',
    id: simpleUser.id,
    name: simpleUser.name,
    photo: simpleUser.photo,
    score: simpleUser.score,
  });
};

const createTheme = async (req, res) => {
  const { list } = req.body;
  if (!list) {
    return res.status(400).send('List is required');
  }
  // check if list is empty
  if (!list.length) {
    return res.status(400).send('List is empty');
  }

  const oldList = await Theme.find().catch((err) => res.status(500).send(`Find db failure-${err}`));
  const tempList = [...oldList];
  const newList = list.filter((item) => {
    let isDuplicate = false;
    tempList.forEach((tempItem) => {
      if (item.themeTW === tempItem.themeTW) {
        isDuplicate = true;
      }
    });
    if (!isDuplicate) {
      tempList.push(item);
      return true;
    }
    return false;
  });

  // check if list is empty
  if (!newList.length) {
    return res.status(400).send('All items are duplicate');
  }

  // save to db
  try {
    await Theme.insertMany(newList);
  } catch (err) {
    return res.status(500).send(`Save to db failure-${err}`);
  }

  return res.json({
    message: 'Save to db success',
  });
};

const getSimpleUser = async (req, res) => {
  // verify token
  const token = req.cookies.guessai_canvas_access_token;

  if (!token) {
    return res.status(403).send('No token');
  }

  await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
    if (decoded) {
      const simpleUser = await SimpleUser.findById(decoded.userId);
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

const getUserPhoto = async (req, res) => {
  const { filename } = req.params;
  const imgPath = path.join(__dirname, `../uploads/guessai_canvas/img/${filename}`);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(imgPath);
};

const getMsgList = async (req, res) => {
  const msgList = await Messages.find().populate('user').sort({ createdAt: -1 }).limit(1000);
  msgList.reverse();
  return res.json(msgList);
};

const getCanvas = async (req, res) => {
  const canvas = await GuessAICanvas.findOne().sort({ createdAt: -1 }).limit(1);
  if (!canvas || canvas.solved) {
    // response opacity 0 to hide canvas
    const iframe = /* html */`
    <!DOCTYPE html>
    <html lang="zh-tw">
    <head>
      <meta charset="UTF-8">
      <title>guessAI Canvas</title>
    </head>
    <style>
      body, html {
        opacity: 0;
      }
    </style>
    <body>
    </body>`;
    return res.send(iframe);
  }
  const iframe = /* html */`
  <!DOCTYPE html>
  <html lang="zh-tw">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>guessAI Canvas</title>
  </head>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      background-color: #eae0d5;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    canvas {
      display: block;
      margin: 0 auto;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
  <body>
    ${canvas.canvas}
  </body>
  </html>
  `;

  return res.send(iframe);
};

const getGalleryCanvas = async (req, res) => {
  const { id } = req.params;
  const canvas = await GuessAICanvas.findById(id);
  if (!canvas) {
    return res.status(404).send('Not found');
  }
  const iframe = /* html */`
  <!DOCTYPE html>
  <html lang="zh-tw">
  <head>
    <meta charset="UTF-8">
    <title>guessAI Canvas</title>
  </head>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      background-color: #EAE0D5 !important;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    canvas {
      display: block;
      margin: 0 auto;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  </style>
  <body>
    ${canvas.canvas}
  </body>
  </html>
  `;

  return res.send(iframe);
};

const getRanking = async (req, res) => {
  const users = await SimpleUser.find().sort({ score: -1 }).limit(30);
  return res.json(users);
};

const updateSimpleUser = async (req, res) => {
  // const { score } = req.body;
  const token = req.cookies.guessai_canvas_access_token;

  if (!token) {
    return res.status(403).send('No token');
  }

  await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
    if (decoded) {
      const simpleUser = await SimpleUser.findById(decoded.userId);
      if (!simpleUser) {
        return res.status(403).send('User not found');
      }

      const filename = req.file?.filename;

      if (filename) {
        // delete old photo
        const oldPhoto = simpleUser.photo;
        if (oldPhoto) {
          try {
            const oldPhotoPath = path.join(__dirname, `../uploads/guessai_canvas/img/${oldPhoto}`);
            fs.unlinkSync(oldPhotoPath);
          } catch (error) {
            console.error(error);
          }
        }
        simpleUser.photo = filename;
      }

      await simpleUser.save();

      return res.json({
        message: 'success',
        simpleUser,
      });
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

const updateCanvas = async (req, res) => { };

const getCanvasList = async (req, res) => {
  const { page, keyword } = req.query;
  if (Number(page) < 1) {
    return res.status(404).send('Not found');
  }
  const firstCanvas = await GuessAICanvas.findOne().sort({ createdAt: -1 }).limit(1);
  const totalData = await GuessAICanvas.countDocuments({ $ne: firstCanvas._id });
  let totalPage = totalData / 12;
  totalPage = Math.ceil(totalPage);
  if (Number(page) > totalPage) {
    return res.status(404).send('Not found');
  }
  const solvedCanvasCount = await GuessAICanvas
    .countDocuments({ correctRespondent: { $exists: true }, $ne: firstCanvas._id });
  const query = { $ne: firstCanvas._id };
  if (keyword) {
    const keywordFilter = xss(keyword);
    query.$or = [
      { answerTW: { $regex: keywordFilter, $options: 'i' } },
      { answerEN: { $regex: keywordFilter, $options: 'i' } },
      { answerJP: { $regex: keywordFilter, $options: 'i' } },
    ];
  }
  const canvasList = await GuessAICanvas.find(query).populate('correctRespondent').sort({ createdAt: -1 }).skip((Number(page) - 1) * 12)
    .limit(12);
  if (!canvasList) {
    return res.status(404).send('Not found');
  }
  return res.json({
    canvasList,
    currentPage: Number(page),
    total: totalData,
    solvedProbability: Number(((solvedCanvasCount / totalData) * 100).toFixed(2)),
    totalPage,
  });
};

module.exports = {
  createSimpleUser,
  createTheme,
  updateSimpleUser,
  updateCanvas,
  getSimpleUser,
  getCanvas,
  getCanvasList,
  getUserPhoto,
  getMsgList,
  getRanking,
  getGalleryCanvas,
};
