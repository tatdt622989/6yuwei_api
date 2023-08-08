const { Configuration, OpenAIApi } = require('openai');

/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');

const upload = multer();
const { requireUser, requireAdmin } = require('../middlewares/auth');

const OpenAIAPIKey = process.env.OPENAI_API_KEY2;

// models
const { Component, ComponentType } = require('../models/component');

// 使用gpt生成元件
router.post('/generate/', requireUser, upload.none(), async (req, res) => {
  const { prompt, componentType } = req.body;
  console.log(prompt);
  console.log(componentType);
  console.log(OpenAIAPIKey);

  if (!prompt || !componentType) {
    return res.status(400).send('Invalid request');
  }

  const configuration = new Configuration({
    apiKey: OpenAIAPIKey,
  });

  const openai = new OpenAIApi(configuration);
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-16k-0613',
      messages: [
        { role: 'system', content: 'You are a professional front-end engineer and a security expert, dedicated to producing high-quality and secure css styles.' },
        { role: 'user', content: `The categories use css buttons, the theme uses "${prompt}", and the corresponding css style is generated using this html: <button id="aiBtn"></button>.` },
      ],
      temperature: 1,
      functions: [
        {
          name: 'generateCSS',
          description: 'Generate css styles from categories and themes and save them.',
          parameters: {
            type: 'object',
            properties: {
              css: {
                type: 'string',
                description: 'Styles of the classification and theme.',
              },
            },
            required: ['generateCSS'],
          },
        },
      ],
    });
    console.log(response);
    const content = response.data.choices[0].message.function_call.arguments;
    return res.json(content);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
});

// 建立元件類型
router.post('/types/', requireAdmin, upload.none(), async (req, res) => {
  const {
    title, description, html, javascript,
  } = req.body;
  if (!title || !html) {
    return res.status(400).send('Invalid request');
  }
  try {
    const componentType = new ComponentType({
      title,
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

module.exports = router;
