const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
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
const memberRouter = require('./routes/members');
const guessAICanvasRouter = require('./routes/guessai_canvas');
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
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://6yuwei.com', 'https://ai.6yuwei.com', 'https://api.6yuwei.com', 'https://www.6yuwei.com', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:3001', 'http://localhost:8888'],
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'credentials'],
    credentials: true,
  },
});

// 跨域設定
let allowedOrigins = ['https://6yuwei.com', 'https://ai.6yuwei.com', 'https://api.6yuwei.com', 'https://www.6yuwei.com'];
if (env === 'development') {
  allowedOrigins = ['http://localhost:3000', 'http://localhost:8888', 'http://127.0.0.1:5500', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://localhost:5173'];
}
app.use(
  cors({
    origin: allowedOrigins,
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
app.use('/members/', memberRouter);
app.use('/guessai_canvas/', guessAICanvasRouter);

// socket.io
io.on('connection', (socket) => {
  const accessToken = socket.handshake.headers.cookie?.split('access_token=')[1]?.split(';')[0];
  // eslint-disable-next-line no-param-reassign
  socket.accessToken = accessToken; // save accessToken to socket
  console.log('a user connected');

  // get message from client
  socket.on('message', (msg) => {
    // verify token
    if (!accessToken) {
      return;
    }

    console.log(msg);
    io.emit('message', msg);
  });
});

io.on('connection_error', (err) => {
  console.log(err.req); // the request object
  console.log(err.code); // the error code, for example 1
  console.log(err.message); // the error message, for example "Session ID unknown"
  console.log(err.context); // some additional error context
});

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
      model: 'gpt-4-1106-preview',
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
server.listen(3001, () => {
  console.log(process.env.DB_URL);
  console.log('伺服器正在port3001上運行');
});

server.timeout = 1000 * 60 * 5;
