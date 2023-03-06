const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const puppeteer = require('puppeteer');
const { Configuration, OpenAIApi } = require('openai');
const cors = require('cors');
const authRouter = require('./routes/auth');
const { verifyToken } = require('./middlewares/auth');

// 獲取環境變數
const dbURL = process.env.DB_URL;
const OpenAIAPIKey = process.env.OPENAI_API_KEY;
const env = process.env.NODE_ENV;

// 連接資料庫
mongoose.set('strictQuery', true);
mongoose
  .connect(`${dbURL}6yuwei`, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('資料庫連接成功');
  })
  .catch((err) => {
    console.log('資料庫連接失敗', err);
  });

const app = express();

// 跨域設定
let allowedOrigins = ['https://6yuwei.com', 'https://ai.6yuwei.com'];
if (env === 'development') {
  allowedOrigins = ['http://localhost:3000', 'http://127.0.0.1:5500/', 'http://localhost:8888'];
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  }),
);

app.use(cookieParser());

// 重定向到安全的路徑
app.use((req, res, next) => {
  if (req.path.substr(-1) !== '/' && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    const safePath = `${req.path}/`;
    res.redirect(301, safePath + query);
  } else {
    next();
  }
});

// 驗證token
app.use(verifyToken);

app.use('/', authRouter);

app.get('/', (req, res) => {
  res.send('ホームページへようこそ');
});

app.get('/chat/', async (req, res) => {
  const { prompt } = req.query;
  const configuration = new Configuration({
    apiKey: OpenAIAPIKey,
  });
  const openai = new OpenAIApi(configuration);
  const response = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 1,
    // max_tokens: 4096,
  });
  const { content } = response.data.choices[0].message;
  res.json(content);
});

// 回傳JSON格式
/* app.get('/json', (req, res) => {
  res.json({
    name: 'John',
    age: 30
  });
}); */

// 動態路徑
/* app.get('/news/:article', (req, res) => {
  res.send(`ニュース記事${req.params.article}へようこそ`);
}); */

// 404
app.get('*', (req, res) => {
  res.send('404 - お探しのページは見つかりませんでした');
});

// port, callback
app.listen(3000, () => {
  console.log('伺服器正在port3000上運行');
});
