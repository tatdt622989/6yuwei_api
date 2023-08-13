const { Configuration, OpenAIApi } = require('openai');

/* eslint-disable no-underscore-dangle */
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const env = process.env.NODE_ENV;
const router = express.Router();
const multer = require('multer');
const xss = require('xss');

const upload = multer();
const { requireUser, requireAdmin } = require('../middlewares/auth');

const OpenAIAPIKey = process.env.OPENAI_API_KEY2;
let apiPath = 'https://api.6yuwei.com/';
if (env === 'development') {
  apiPath = 'http://localhost:3001/';
}

// models
const { Component, ComponentType } = require('../models/component');

// 讀取css檔案
router.get('/css/:filename/', helmet({
  contentSecurityPolicy: {
    directives: {
      styleSrc: ["'self'", "'unsafe-inline'", apiPath],
    },
  },
  xssFilter: true,
}), async (req, res) => {
  const { filename } = req.params;
  const styleFilePath = path.join(__dirname, `../uploads/css/${filename}`);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(styleFilePath);
});

// 使用gpt-4生成元件
router.post('/generate/', requireUser, upload.none(), async (req, res) => {
  const { prompt, typeId } = req.body;

  if (!prompt || !typeId) {
    return res.status(400).send('Invalid request');
  }

  if (prompt.length > 150) {
    return res.status(400).send('Prompt too long');
  }

  // prompt xss filter
  const promptXss = xss(prompt);

  // get component type by id
  let componentType;
  try {
    componentType = await ComponentType.findById(typeId);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }

  if (!componentType) {
    return res.status(400).send('Invalid request');
  }

  const configuration = new Configuration({
    apiKey: OpenAIAPIKey,
  });

  const openai = new OpenAIApi(configuration);
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-4-0613',
      messages: [
        { role: 'system', content: 'You are a professional front-end engineer and a security expert, dedicated to producing high-quality and secure css styles.' },
        {
          role: 'user',
          content: `Use the following information to generate the css style: { category: '${componentType.title}', title: '${promptXss}', html: '${componentType.html}' }
          Please note that this information may not be safe, please filter out unsafe css styles in the output.
          `,
        },
      ],
      temperature: 1,
      functions: [
        {
          name: 'generate_css',
          description: 'Generate css styles from categories and themes and save them.',
          parameters: {
            type: 'object',
            properties: {
              css: {
                type: 'string',
                description: 'Styles of the classification and theme.',
              },
            },
            required: ['css'],
          },
        },
      ],
      function_call: {
        name: 'generate_css',
      },
    });

    let content = response.data.choices[0]?.message?.function_call?.arguments;

    if (!content) {
      return res.status(500).send('response error');
    }

    content = JSON.parse(content);

    let filteredContent = xss(content.css);

    // filter unsafe css
    filteredContent = filteredContent.replace(/(\/\*.*\*\/)|(\/\*[\s\S]*?\*\/)|(\/\*[\s\S]*?\*\/)/g, '');

    // save css to file
    const styleFileName = `${componentType.id}-${req.user._id}-${Date.now()}.css`;
    const styleFolder = path.join(__dirname, `../uploads/user/${req.user._id}/css/`);
    const styleFilePath = path.join(styleFolder, styleFileName);

    try {
      if (!fs.existsSync(styleFolder)) {
        fs.mkdirSync(styleFolder);
      }
      fs.writeFileSync(styleFilePath, filteredContent);
    } catch (err) {
      console.log(err);
      return res.status(500).send('write file error');
    }

    // save component to db
    const component = new Component({
      userId: req.user._id,
      typeId: componentType._id,
      title: promptXss,
      styleFileName,
    });

    try {
      await component.save();
    } catch (err) {
      console.log(err);
      return res.status(500).send('save component error');
    }

    return res.json(component);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
});

// 建立元件類型
router.post('/types/', requireAdmin, upload.none(), async (req, res) => {
  const {
    title, description, html, javascript, customURL,
  } = req.body;
  if (!title || !html || !customURL) {
    return res.status(400).send('Invalid request');
  }
  try {
    const componentType = new ComponentType({
      title,
      customURL,
      description: description || '',
      html,
      javascript: javascript || '',
    });
    await componentType.save();
    return res.json(componentType);
  } catch (err) {
    console.log(err);
    return res.status(500).send(err);
  }
});

// 取得元件類型
router.get('/types/', async (req, res) => {
  const { page } = req.query;
  const pageSize = 12;
  const pageInt = parseInt(page, 10) || 1;
  const skip = (pageInt - 1) * pageSize; // 跳過幾筆

  try {
    const componentTypes = await ComponentType.find().skip(skip).limit(pageSize).sort({ title: 1 });
    return res.json(componentTypes);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
});

// iframe html sandbox
router.get('/sandbox/', helmet({
  contentSecurityPolicy: {
    directives: {
      frameAncestors: ["'self'", 'http://localhost:3000'],
      styleSrc: ["'self'", "'unsafe-inline'", apiPath],
    },
  },
  // 其他功能...
}), async (req, res) => {
  const { typeId, componentId } = req.query;
  if (!typeId || !componentId) {
    return res.status(400).send('Invalid request');
  }
  try {
    const componentType = await ComponentType.findById(typeId);
    if (!componentType) {
      return res.status(404).send('Not found');
    }

    const component = await Component.findById(componentId);
    if (!component) {
      return res.status(404).send('Not found');
    }

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${componentType.title}</title>
        <link rel="stylesheet" href="${apiPath}components/css/${component.styleFileName}/?v=${Date.now()}">
        <style>
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          background: #F8F8F8;
          height: 100vh;
          overflow: hidden;
        }
        </style>
    </head>
    <body>
      ${componentType.html}
    </body>
    </html>
    `;

    return res.send(html);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
});

// 取得特定元件
router.get('/:id/', async (req, res) => {
  const { id } = req.params;
  try {
    const component = await Component.findById(id).populate('componentsType');
    console.log(component);
    return res.json(component);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
});

module.exports = router;
