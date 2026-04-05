require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const OpenAI = require('openai');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const socketServer = require('./sockets/socketServer');
const authRouter = require('./routes/auth');
const websitesRouter = require('./routes/websites');
const threeDCGsRouter = require('./routes/3dcgs');
const animationsRouter = require('./routes/animations');
const adminRouter = require('./routes/admin');
const contactRouter = require('./routes/contact');
const componentsRouter = require('./routes/components');
const memberRouter = require('./routes/members');
const guessAICanvasRouter = require('./routes/guessai_canvas');
const { getAllowedOrigins } = require('./config/origins');
const { verifyToken, requireAdmin } = require('./middlewares/auth');
const { attachClientIp, normalizeIp } = require('./middlewares/clientIp');

const outputLog = fs.createWriteStream('output.log', { flags: 'a' });

// 將console.log輸出到檔案
console.log = (message) => {
  outputLog.write(`${new Date().toISOString()}: ${message}\n`);
  process.stdout.write(`${new Date().toISOString()}: ${message}\n`);
};

// 獲取環境變數
const dbURL = process.env.DB_URL;
const dbName = process.env.DB_NAME || '6yuwei';
const OpenAIAPIKey = process.env.OPENAI_API_KEY;
const env = process.env.NODE_ENV;
const port = Number(process.env.PORT) || 3000;

const openai = new OpenAI({
  apiKey: OpenAIAPIKey,
});

const mongoReadyStateMap = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const buildMongoUri = (uri, defaultDbName) => {
  if (!uri) {
    return uri;
  }

  try {
    const parsedUri = new URL(uri);

    if (!parsedUri.pathname || parsedUri.pathname === '/') {
      parsedUri.pathname = `/${defaultDbName}`;
    }

    if (parsedUri.username && !parsedUri.searchParams.has('authSource')) {
      parsedUri.searchParams.set('authSource', 'admin');
    }

    return parsedUri.toString();
  } catch (err) {
    if (uri.includes('/?')) {
      const connector = uri.includes('authSource=') ? '' : '&authSource=admin';
      return uri.replace('/?', `/${defaultDbName}?`) + connector;
    }

    if (uri.endsWith('/')) {
      const connector = uri.includes('?') ? '&' : '?';
      return `${uri}${defaultDbName}${connector}authSource=admin`;
    }

    return uri;
  }
};

const mongoUri = buildMongoUri(dbURL, dbName);

// 連接資料庫
mongoose.set('strictQuery', true);
mongoose
  .connect(mongoUri, {
    family: 4,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('資料庫連接成功');
  })
  .catch((err) => {
    console.log(`資料庫連接失敗: ${err.message}`);
  });

const app = express();
const server = createServer(app);
socketServer(server);

if (env === 'production') {
  app.set('trust proxy', true);
}

// 跨域設定
const allowedOrigins = getAllowedOrigins(env);

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
app.use(attachClientIp);

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

// other routes..
app.get('/', (req, res) => {
  res.send('ホームページへようこそ');
});

app.get('/chat/', async (req, res) => {
  const { prompt, systemPrompt } = req.query;
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    });
    const { content } = response.choices[0].message;
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
    requestIp: req.clientIp,
    proxyIp: normalizeIp(req.socket?.remoteAddress || '') || 'unknown',
    serverTime: `${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage(),
    pid: process.pid,
  };

  res.json(status);
});

app.get('/health/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: mongoReadyStateMap[dbState] || 'unknown',
  });
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
server.listen(port, () => {
  console.log(`伺服器正在port${port}上運行`);
});

server.timeout = 1000 * 60 * 5;
