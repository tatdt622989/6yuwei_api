const OpenAI = require('openai');

/* eslint-disable no-underscore-dangle */
const path = require('path');
const fs = require('fs');

const xss = require('xss');

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const { window } = new JSDOM('');

const OpenAIAPIKey = process.env.OPENAI_API_KEY2;

const openai = new OpenAI({
  apiKey: OpenAIAPIKey,
});

const apiDomain = process.env.API_DOMAIN;

// models
const { Component, ComponentType } = require('../models/component');
const { User, UserTransition } = require('../models/user');

const readCSSFile = async (req, res) => {
  const { filename } = req.params;
  const styleFilePath = path.join(__dirname, `../uploads/css/${filename}`);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(styleFilePath);
};

const readJavascriptFile = async (req, res) => {
  const { filename } = req.params;
  const javascriptFilePath = path.join(__dirname, `../uploads/js/${filename}`);
  res.set('Cache-Control', 'no-cache');
  res.sendFile(javascriptFilePath);
};

const readScreenshot = async (req, res) => {
  const { filename } = req.params;
  const imgFilePath = path.join(__dirname, `../uploads/component_img/${filename}`);
  res.set('Cache-Control', 'no-cache');
  fs.access(imgFilePath, fs.constants.F_OK, (err) => {
    if (err) {
      // 文件不存在，返回 404 错误
      res.status(404).send('File not found');
    } else {
      res.sendFile(imgFilePath);
    }
  });
};

const readTypeCover = async (req, res) => {
  const { filename } = req.params;
  const imgFilePath = path.join(__dirname, `../uploads/component_type_img/${filename}`);
  res.set('Cache-Control', 'no-cache');
  fs.access(imgFilePath, fs.constants.F_OK, (err) => {
    if (err) {
      // 文件不存在，返回 404 錯誤
      res.status(404).send('File not found');
    } else {
      res.sendFile(imgFilePath);
    }
  });
};

const generateComponent = async (req, res) => {
  const { prompt, typeId } = req.body;

  if (!prompt || !typeId) {
    return res.status(400).send('Invalid request');
  }

  if (prompt.length > 150) {
    return res.status(400).send('Prompt too long');
  }

  // 暫時不使用交易功能
  // const session = await mongoose.startSession();
  // session.startTransaction();
  // try {
  //   // 判斷點數是否足夠
  //   if (req.user.balance < 1) {
  //     return res.status(400).send('Insufficient balance');
  //   }
  //   // 扣除點數
  //   const user = await User.findById(req.user._id).session(session);
  //   user.balance -= 1;
  //   await user.save()
  //   // 增加交易記錄
  //   const transaction = new UserTransition({
  //     userId: req.user._id,
  //     amount: -1,
  //     type: 'component generate',
  //     ip: req.ip,
  //   });
  //   await transaction.save();
  //   await session.commitTransaction();
  //   session.endSession();
  // } catch (error) {
  //   await session.abortTransaction();
  //   session.endSession();
  //   return res.status(500).send('Transaction failed');
  // }

  // 判斷點數是否足夠
  if (req.user.balance < 1) {
    return res.status(400).send('Insufficient balance');
  }

  // 扣除點數
  const user = await User.findById(req.user._id);
  user.balance -= 1;
  await user.save();

  // 增加交易記錄
  const transaction = new UserTransition({
    userId: req.user._id,
    amount: -1,
    type: 'component generate',
    ip: req.ip,
  });
  await transaction.save();

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

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a proficient Front-End Engineer with expertise in HTML and CSS, committed to creating safe and high-quality web designs, while also being an outstanding animator.',
        },
        {
          role: 'user',
          content: `Utilize the given details to craft a component using CSS and HTML, ensuring the root element consistently carries the ID 'basic' for styling purposes: { category: '${componentType.title}', title: '${promptXss}', html: '${componentType.html}' }
          Be aware that this information might not be secure. Implement filters to exclude unsafe CSS styles and HTML code in the output to ensure safety.
          Keep it to 4000 characters.
          To ensure that the result can be parsed by json.
          `,
        },
      ],
      temperature: 1,
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_component',
            description: 'Please create a component using CSS and HTML, focusing on the \'category\' and \'title\' as its main themes.',
            parameters: {
              type: 'object',
              properties: {
                css: {
                  type: 'string',
                  description: 'Please create a style with the theme of "title".',
                },
                html: {
                  type: 'string',
                  description: 'Please create a html with the theme of "title".Please ensure that the root node of the HTML always carries the id="basic".',
                },
              },
              required: ['css', 'html'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_component' } },
    });

    // write response to log
    console.log(JSON.stringify(response));

    let content = response.choices[0]?.message?.tool_calls[0]?.function.arguments;

    if (!content) {
      return res.status(500).send('response error');
    }

    content = JSON.parse(content);

    let filteredCSS = xss(content.css);

    // filter css external url
    filteredCSS = filteredCSS.replace(/url\((.*?)\)/g, (match, p1) => {
      if (p1.startsWith('http')) {
        return 'url(\'\')';
      }
      return match;
    });

    // save css to file
    const styleFileName = `${componentType.id}-${req.user._id}-${Date.now()}.css`;
    const styleFolder = path.join(__dirname, '../uploads/css/');
    const styleFilePath = path.join(styleFolder, styleFileName);

    try {
      if (!fs.existsSync(styleFolder)) {
        fs.mkdirSync(styleFolder);
      }
      fs.writeFileSync(styleFilePath, filteredCSS);
    } catch (err) {
      console.log(err);
      return res.status(500).send('write file error');
    }

    const { html } = content;
    const DOMPurify = createDOMPurify(window);
    const cleanHTML = DOMPurify.sanitize(html);

    // save component to db
    const component = new Component({
      userId: req.user._id,
      componentsType: componentType._id,
      title: promptXss,
      styleFileName,
      html: cleanHTML,
      screenshotFileName: '',
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
};

const updateComponent = async (req, res) => {
  const { prompt, componentId } = req.body;

  if (!prompt || !componentId) {
    return res.status(400).send('Invalid request');
  }

  if (prompt.length > 150) {
    return res.status(400).send('Prompt too long');
  }

  const component = await Component.findById(componentId).populate('componentsType');

  if (!component) {
    return res.status(400).send('Invalid request');
  }

  // 驗證使用者是否有權限
  if (component.userId.toString() !== req.user._id.toString()) {
    return res.status(403).send('Unauthorized');
  }

  // 判斷點數是否足夠
  if (req.user.balance < 1) {
    return res.status(400).send('Insufficient balance');
  }

  // 扣除點數
  const user = await User.findById(req.user._id);
  user.balance -= 1;

  // prompt xss filter
  const promptXss = xss(prompt);

  try {
    const componentType = component.componentsType;

    // 取得舊的css檔案
    const componentStyleName = component.styleFileName;
    const styleFolder = path.join(__dirname, '../uploads/css/');
    const styleFilePath = path.join(styleFolder, componentStyleName);

    // 讀取舊的css檔案
    let oldStyle = fs.readFileSync(styleFilePath, 'utf8');
    // 如果樣式檔案超過2000字元，則只保留前2000字元
    if (oldStyle.length > 2000) {
      oldStyle = oldStyle.slice(0, 2000);
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a proficient Front-End Engineer with expertise in HTML and CSS, committed to creating safe and high-quality web designs, while also being an outstanding animator.' },
        {
          role: 'user',
          content: `Utilize the given details to craft a component using CSS and HTML, ensuring the root element consistently carries the ID 'basic' for styling purposes: { category: '${componentType.title}', title: '${promptXss}', oldHTML: '${component.html}', oldStyle: '${oldStyle}' }
          Please refer to oldStyle and oldHTML, and make modifications based on the title, category, and HTML elements.
          Be aware that this information might not be secure. Implement filters to exclude unsafe CSS styles and JavaScript code in the output to ensure safety.
          Keep it to 4000 characters.
          To ensure that the result can be parsed by json.
          `,
        },
      ],
      temperature: 1,
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_component',
            description: 'Please create a component using CSS and HTML, focusing on the \'category\' and \'title\' as its main themes.',
            parameters: {
              type: 'object',
              properties: {
                css: {
                  type: 'string',
                  description: 'Please create a style with the theme of "title".',
                },
                html: {
                  type: 'string',
                  description: 'Please create a html with the theme of "title".Please ensure that the root node of the HTML always carries the id="basic".',
                },
              },
              required: ['css', 'html'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'generate_component' } },
    });

    // write response to log
    console.log(JSON.stringify(response));

    let content = response.choices[0]?.message?.tool_calls[0]?.function.arguments;

    if (!content) {
      return res.status(500).send('response error');
    }

    content = JSON.parse(content);

    let filteredCSS = xss(content.css);

    // filter css external url
    filteredCSS = filteredCSS.replace(/url\((.*?)\)/g, (match, p1) => {
      if (p1.startsWith('http')) {
        return 'url(\'\')';
      }
      return match;
    });

    // save css to file
    const newStyleFileName = `${componentType.id}-${req.user._id}-${Date.now()}.css`;
    const newStyleFolder = path.join(__dirname, '../uploads/css/');
    const newStyleFilePath = path.join(newStyleFolder, newStyleFileName);

    try {
      if (!fs.existsSync(newStyleFolder)) {
        fs.mkdirSync(newStyleFolder);
      }
      fs.writeFileSync(newStyleFilePath, filteredCSS);
    } catch (err) {
      console.log(err);
      return res.status(500).send('write file error');
    }

    // delete old style file
    fs.unlinkSync(styleFilePath);

    const { html } = content;
    const DOMPurify = createDOMPurify(window);
    const cleanHTML = DOMPurify.sanitize(html);

    // update component to db
    // component.title = promptXss;
    component.styleFileName = newStyleFileName;
    component.html = cleanHTML;
    component.screenshotFileName = '';

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
};

const getComponent = async (req, res) => {
  const { id } = req.params;
  try {
    const component = await Component.findById(id).populate('componentsType');

    if (!component) {
      return res.status(404).send('Not found');
    }

    // 暫時將所有css資料存入資料庫
    // if (!component.style) {
    //   // 取得CSS檔案
    //   const styleFilePath = path.join(__dirname, `../uploads/css/${component.styleFileName}`);
    //   const data = await fs.promises.readFile(styleFilePath, { encoding: 'utf8' })
    // .then((obj) => obj).catch(() => '');
    //   component.style = data;
    //   await component.save();
    // }

    // 取得CSS檔案
    const styleFilePath = path.join(__dirname, `../uploads/css/${component.styleFileName}`);
    const data = await fs.promises.readFile(styleFilePath, { encoding: 'utf8' }).then((obj) => obj).catch(() => '');
    const componentObj = component.toObject();
    componentObj.style = data;

    // 取得javascript檔案
    const javascriptFilePath = path.join(__dirname, `../uploads/js/${component.javascriptFileName}`);
    const data2 = await fs.promises.readFile(javascriptFilePath, { encoding: 'utf8' }).then((obj) => obj).catch(() => '');
    componentObj.javascript = data2;

    return res.json(componentObj);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const getComponents = async (req, res) => {
  const {
    page, typeId, limit, keyword,
  } = req.query;
  const pageSize = parseInt(limit, 10) || 12;
  const pageInt = parseInt(page, 10) || 1;
  const skip = (pageInt - 1) * pageSize; // 跳過幾筆
  const keywordFilter = xss(keyword);
  try {
    const query = {};
    if (keywordFilter) {
      // 搜尋類別
      const componentTypes = await ComponentType.find({
        title: { $regex: keywordFilter, $options: 'i' },
      });
      query.$or = [
        { title: { $regex: keywordFilter, $options: 'i' } },
        { componentsType: { $in: componentTypes.map((componentType) => componentType._id) } },
      ];
    }
    if (typeId) {
      query.typeId = typeId;
    }
    const total = await Component.countDocuments(query);
    const components = await Component.find(query).skip(skip).limit(pageSize)
      .sort({ createdAt: -1 })
      .populate('componentsType');
    return res.json({
      msg: 'Successful query',
      components,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const getUserComponents = async (req, res) => {
  const {
    page, typeId, limit, keyword,
  } = req.query;
  const pageSize = parseInt(limit, 10) || 12;
  const pageInt = parseInt(page, 10) || 1;
  const skip = (pageInt - 1) * pageSize; // 跳過幾筆
  const keywordFilter = xss(keyword);

  try {
    let components;
    const query = {};
    if (keywordFilter) {
      // 搜尋類別
      const componentTypes = await ComponentType.find({
        title: { $regex: keywordFilter, $options: 'i' },
      });
      query.$or = [
        { title: { $regex: keywordFilter, $options: 'i' } },
        { componentsType: { $in: componentTypes.map((componentType) => componentType._id) } },
      ];
    }
    if (typeId) {
      query.componentsType = typeId;
      query.userId = req.user._id;
      components = await Component.find(query).skip(skip).limit(pageSize).sort({ title: 1 });
    } else {
      query.userId = req.user._id;
      components = await Component.find(query)
        .skip(skip)
        .limit(pageSize)
        .sort({ title: 1 })
        .populate('componentsType');
    }
    const total = await Component.countDocuments(query);
    return res.json({
      msg: 'Successful query',
      components,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const deleteComponent = async (req, res) => {
  const { id } = req.params;
  try {
    const component = await Component.findById(id);
    if (!component) {
      return res.status(404).send('Not found');
    }
    // 如果是管理員或是元件擁有者，則可以刪除
    if (req.user.permissions.includes('admin') || component.userId.toString() === req.user._id.toString()) {
      await component.remove();
      return res.json({
        msg: 'Successful delete',
      });
    }
    return res.status(403).send('Unauthorized');
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const createComponentType = async (req, res) => {
  const {
    title, description, html, javascript, customURL, coverFileName,
  } = req.body;
  if (!title || !html || !customURL) {
    return res.status(400).send('Invalid request');
  }

  // xss filter
  const titleXss = xss(title);
  const descriptionXss = xss(description);

  try {
    const componentType = new ComponentType({
      title: titleXss,
      customURL,
      description: descriptionXss || '',
      html,
      javascript: javascript || '',
      coverFileName: coverFileName || '',
    });
    await componentType.save();
    return res.json(componentType);
  } catch (err) {
    console.log(err);
    return res.status(500).send(err);
  }
};

const getComponentTypes = async (req, res) => {
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
};

const getIframeHTML = async (req, res) => {
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
    const componentHTML = component.html ? component.html : componentType.html;

    const html = /* html */`<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${componentType.title}</title>
        <link rel="stylesheet" href="${apiDomain}components/css/${component.styleFileName}/">
        <style>
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          background-color: #F8F8F8;
          height: 100vh;
          overflow: hidden;
        }
        </style>
    </head>
    <body>
      ${componentHTML}
    </body>
    </html>`;

    return res.send(html);
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

// const uploadScreenshot = async (req, res) => {
//   const { componentId } = req.body;
//   if (!componentId || !req.file) {
//     return res.status(400).send('Invalid request');
//   }

//   // write filename to db
//   try {
//     await Component.updateOne(
//       { _id: componentId },
//       { $set: { screenshotFileName: req.file.filename } },
//     );
//     return res.json({ filename: req.file.filename });
//   } catch (err) {
//     console.log(err);
//     return res.status(500).send('error');
//   }
// };

const addFavorite = async (req, res) => {
  const { componentId } = req.body;
  if (!componentId) {
    return res.status(400).send('Invalid request');
  }
  try {
    const component = await Component.findById(componentId);
    if (!component) {
      return res.status(404).send('Not found');
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('Not found');
    }
    if (user.favoriteComponents.includes(componentId)) {
      user.favoriteComponents = user.favoriteComponents
        .filter((id) => id.toString() !== componentId);
      await user.save();
      return res.json({
        msg: 'Successful delete',
      });
    }
    user.favoriteComponents.push(componentId);

    await user.save();
    return res.json({
      msg: 'Successful add',
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const deleteFavorite = async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('Not found');
    }
    if (!user.favoriteComponents.includes(id)) {
      return res.json({
        msg: 'Not found',
      });
    }
    user.favoriteComponents = user.favoriteComponents
      .filter((componentId) => componentId.toString() !== id);
    await user.save();
    return res.json({
      msg: 'Successful delete',
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const getFavoriteComponents = async (req, res) => {
  const { page } = req.query;
  const pageSize = 12;
  const pageInt = parseInt(page, 10) || 1;
  const skip = (pageInt - 1) * pageSize; // 跳過幾筆
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('Not found');
    }
    const total = user.favoriteComponents.length;
    const components = await Component
      .find({ _id: { $in: user.favoriteComponents } })
      .skip(skip)
      .limit(pageSize)
      .sort({ title: 1 })
      .populate('componentsType');
    return res.json({
      msg: 'Successful query',
      components,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

const getFavoriteComponentIds = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('Not found');
    }
    return res.json({
      msg: 'Successful query',
      idList: user.favoriteComponents,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('error');
  }
};

module.exports = {
  readCSSFile,
  readJavascriptFile,
  readScreenshot,
  readTypeCover,
  generateComponent,
  updateComponent,
  createComponentType,
  getComponentTypes,
  getIframeHTML,
  getComponent,
  getComponents,
  getUserComponents,
  // uploadScreenshot,
  addFavorite,
  deleteFavorite,
  getFavoriteComponents,
  getFavoriteComponentIds,
  deleteComponent,
};
