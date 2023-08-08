const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const { Configuration, OpenAIApi } = require('openai');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const authRouter = require('./routes/auth');
const websitesRouter = require('./routes/websites');
const threeDCGsRouter = require('./routes/3dcgs');
const animationsRouter = require('./routes/animations');
const adminRouter = require('./routes/admin');
const contactRouter = require('./routes/contact');
const componentsRouter = require('./routes/components');
const { verifyToken, requireAdmin } = require('./middlewares/auth');

const outputLog = fs.createWriteStream('output.log', { flags: 'a' });

// 將console.log輸出到檔案
console.log = (message) => {
  outputLog.write(`${new Date().toISOString()}: ${message}\n`);
  process.stdout.write(`${new Date().toISOString()}: ${message}\n`);
};

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
let allowedOrigins = ['https://6yuwei.com', 'https://ai.6yuwei.com', 'https://api.6yuwei.com', 'https://www.6yuwei.com'];
if (env === 'development') {
  allowedOrigins = ['http://localhost:3000', 'http://localhost:8888', 'http://127.0.0.1:5500', 'http://localhost:3002'];
}
app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'credentials'],
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.static(path.resolve(__dirname, 'node_modules')));

app.use(cookieParser());

// 重定向到安全的路徑
// app.use((req, res, next) => {
//   if (req.path.substr(-1) !== '/' && req.path.length > 1) {
//     const query = req.url.slice(req.path.length);
//     const safePath = `${req.path}/`;
//     res.redirect(301, safePath + query);
//   } else {
//     next();
//   }
// });

// 驗證token
app.use(verifyToken);

// 路由
app.use('/', authRouter);
app.use('/websites/', websitesRouter);
app.use('/3dcgs/', threeDCGsRouter);
app.use('/animations/', animationsRouter);
app.use('/admin/', adminRouter);
app.use('/contact/', contactRouter);
app.use('/components/', componentsRouter);

// other routes..
app.get('/', (req, res) => {
  res.send('ホームページへようこそ');
});
app.get('/chat/', async (req, res) => {
  const { prompt, systemPrompt } = req.query;
  const configuration = new Configuration({
    apiKey: OpenAIAPIKey,
  });
  const openai = new OpenAIApi(configuration);
  try {
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo-16k-0613',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 1,
      // max_tokens: 4096,
    });
    const { content } = response.data.choices[0].message;
    res.json(content);
  } catch (err) {
    console.log(err);
    res.status(500).send('error');
  }
});

// api test
app.get('/test/', requireAdmin, (req, res) => {
  const status = {
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    dbURL,
    env: process.env.NODE_ENV,
    serverTime: `${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
    pid: process.pid,
  };

  res.json(status);
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
const server = app.listen(3001, () => {
  console.log(process.env.DB_URL);
  console.log('伺服器正在port3001上運行');
});

server.timeout = 1000 * 60 * 5;
