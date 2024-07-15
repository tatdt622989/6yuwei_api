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

const socketState = require('../sockets/socketState');
const state = socketState.getSocketState();

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
  const total = await GuessAICanvas.countDocuments({ _id: { $ne: firstCanvas._id } });
  const solvedCanvasCount = await GuessAICanvas
    .countDocuments({ correctRespondent: { $exists: true }, _id: { $ne: firstCanvas._id } });
  const query = { _id: { $ne: firstCanvas._id } };
  if (keyword) {
    const keywordFilter = xss(keyword);
    query.$or = [
      { answerTW: { $regex: keywordFilter, $options: 'i' } },
      { answerEN: { $regex: keywordFilter, $options: 'i' } },
      { answerJP: { $regex: keywordFilter, $options: 'i' } },
    ];
  }
  const resultTotal = await GuessAICanvas.countDocuments(query);
  const resultTotalPage = Math.ceil(resultTotal / 12);
  const canvasList = await GuessAICanvas.find(query).populate('correctRespondent').sort({ createdAt: -1 }).skip((Number(page) - 1) * 12)
    .limit(12);

  return res.json({
    canvasList,
    currentPage: Number(page),
    solvedProbability: Number(((solvedCanvasCount / total) * 100).toFixed(2)),
    resultTotal,
    resultTotalPage,
    total,
  });
};

const generateCanvas = async (io) => {
  console.log('generate canvas');
  if (state.isCanvasGenerating) {
    return;
  }
  state.setSocketState('isCanvasGenerating', true);
  let content = null;

  // get theme from db
  const themeCount = await Theme.countDocuments();
  const random = Math.floor(Math.random() * themeCount);
  const theme = await Theme.findOne().skip(random);

  // generate canvas
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'As an HTML canvas expert and a code artist specializing in theme-based creations, with a keen emphasis on both the aesthetic intricacies and the security of the generated code, I strive to bring forth a unique fusion of technology and artistry.',
        },
        {
          role: 'user',
          content: `
          Create HTML canvas code with '${theme.themeEN}' as the theme, and return it in JSON format within the constraint of 5000 characters.
          Emphasize the need for the drawing to be as intricate and lifelike as possible.
          Do not omit and include any image URLs, or JavaScript comments in the code.`,
        },
      ],
      temperature: 1,
      tools: [
        {
          type: 'function',
          function: {
            name: 'canvasDraw',
            description: 'Generate a canvas image with a 16:9 aspect ratio using only the <script> and <canvas> tags in HTML. Do not include any JavaScript comments in the code.',
            parameters: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'HTML canvas Tag with inline javascript',
                },
              },
              required: ['code'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'canvasDraw' } },
    });

    content = response.choices[0]?.message?.tool_calls[0]?.function.arguments;
    console.log(content);
    if (!content
      || !content.code) {
        state.setSocketState('isCanvasGenerating', false);
      // retry
      // generateCanvas();
    }
    content = JSON.parse(content);
  } catch (err) {
    console.log(err);
    state.setSocketState('isCanvasGenerating', false);
    // retry
    // generateCanvas();
  }

  // If the code contains an answer, remove it as a random English word.
  // If a reserved word does not replace
  const reservedWords = [
    'abstract',
    'arguments',
    'await',
    'boolean',
    'break',
    'byte',
    'case',
    'catch',
    'char',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'double',
    'else',
    'enum',
    'eval',
    'export',
    'extends',
    'false',
    'final',
    'finally',
    'float',
    'for',
    'function',
    'goto',
    'if',
    'implements',
    'import',
    'in',
    'instanceof',
    'int',
    'interface',
    'let',
    'long',
    'native',
    'new',
    'null',
    'package',
    'private',
    'protected',
    'public',
    'return',
    'short',
    'static',
    'super',
    'switch',
    'synchronized',
    'this',
    'throw',
    'throws',
    'transient',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'volatile',
    'while',
    'with',
    'yield',
    'Math',
    'Array',
    'Date',
  ];
  if (!reservedWords.includes(theme.themeEN.toLowerCase())) {
    const atoz = 'abcdefghijklmnopqrstuvwxyz';
    const wordLength = 5;
    let randomEN = '';
    for (let i = 0; i < wordLength; i += 1) {
      randomEN += atoz[Math.floor(Math.random() * atoz.length)];
    }
    const answers = [
      theme.themeEN, // original
      theme.themeEN.toLowerCase(), // lowercase
      theme.themeEN.toLowerCase().charAt(0).toUpperCase()
       + theme.themeEN.toLowerCase().slice(1), // capitalize first letter
      theme.themeEN.toUpperCase(), // capitalize all letters
      theme.themeEN.toLowerCase().replace(' ', '-'), // dash
      theme.themeEN.toLowerCase().replace(' ', '_'), // underscore
      theme.themeEN.toLowerCase().replace(' ', ''), // remove space
      theme.themeEN.toLowerCase().replace(' ', '').charAt(0).toUpperCase() + theme.themeEN.toLowerCase().replace(' ', '').slice(1), // remove space and capitalize first letter
    ];
    for (let i = 0; i < answers.length; i += 1) {
      content.code = content.code.replace(new RegExp(answers[i], 'g'), randomEN);
    }
  }

  // save canvas to db
  const {
    code,
  } = content;

  try {
    const guessaiCanvas = new GuessAICanvas({
      canvas: code,
      answerTW: theme.themeTW,
      answerEN: theme.themeEN,
      answerJP: theme.themeJP,
      solved: false,
    });
    await guessaiCanvas.save();
  } catch (err) {
    console.log(err);
  }

  if (io) {
    // emit canvas to all clients
    io.emit('server canvas', {
      status: 'done',
    });
  }
  
  console.log('generate canvas done');
  console.log(state.isCanvasGenerating);
  state.setSocketState('isCanvasGenerating', false);
  console.log(state.isCanvasGenerating);
  return 'ok';
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
  generateCanvas,
};
