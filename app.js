require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
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
const reisuiRouter = require('./routes/reisui');
const dictWordsRouter = require('./routes/dictWords');
const dictVocabularyRouter = require('./routes/dictVocabulary');
const studioSaveRouter = require('./routes/studioSave');
const studioUpdatesRouter = require('./routes/studioUpdates');
const { getAllowedOrigins } = require('./config/origins');
const { verifyToken, requireAdmin } = require('./middlewares/auth');
const { attachClientIp, normalizeIp } = require('./middlewares/clientIp');

// 獲取環境變數
const dbURL = process.env.DB_URL;
const dbName = process.env.DB_NAME || '6yuwei';
const env = process.env.NODE_ENV;
const port = Number(process.env.PORT) || 3000;

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

app.disable('x-powered-by');

// Express leaves req.body undefined when a request has no parsed body, and the routes read fields from it
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

// App 的公開單字路由，放在全域 CORS 和登入驗證之前：App 沒有登入，也不帶 cookie
app.use(
  '/dict/vocabulary/',
  cors({ methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }),
  express.json(),
  attachClientIp,
  dictVocabularyRouter,
);

// Mac App 的更新檔，檢查更新時不需要登入
app.use('/studio/updates/', studioUpdatesRouter);

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

// 存檔比一般請求大，要先於全域的 JSON 解析
app.use('/studio/save/', express.json({ limit: '5mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use('/reisui/codes/', reisuiRouter);
app.use('/dict/admin/words/', dictWordsRouter);
app.use('/studio/save/', studioSaveRouter);

// other routes..
app.get('/', (req, res) => {
  res.send('ホームページへようこそ');
});

// api test
app.get('/test/', requireAdmin, (req, res) => {
  const status = {
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
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
app.use((req, res) => {
  res.status(404).send('404 - お探しのページは見つかりませんでした');
});

// 錯誤處理：內部訊息只寫進紀錄，不回傳給用戶端
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).send('Bad request');
  }
  console.error(err);
  return res.status(500).send('Server error');
});

// A rejected promise outside a route must not stop the API for everyone
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// port, callback
server.listen(port, () => {
  console.log(`伺服器正在port${port}上運行`);
});

server.timeout = 1000 * 60 * 5;
