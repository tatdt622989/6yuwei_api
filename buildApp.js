const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const websitesRouter = require('./routes/websites');
const threeDCGsRouter = require('./routes/3dcgs');
const animationsRouter = require('./routes/animations');
const adminRouter = require('./routes/admin');
const adminProfilesRouter = require('./routes/adminProfiles');
const contactRouter = require('./routes/contact');
const componentsRouter = require('./routes/components');
const reisuiRouter = require('./routes/reisui');
const dictWordsRouter = require('./routes/dictWords');
const dictVocabularyRouter = require('./routes/dictVocabulary');
const studioSaveRouter = require('./routes/studioSave');
const studioUpdatesRouter = require('./routes/studioUpdates');
const bpRouter = require('./routes/bp');
const bpSharedRouter = require('./routes/bpShared');
const { createLegacyRedirects } = require('./routes/legacyRedirects');
const internalRouter = require('./routes/internal');
const meRouter = require('./routes/me');
const { requireRole, requireTrustedOrigin } = require('./middlewares/authenticate');
const { attachClientIp, normalizeIp } = require('./middlewares/clientIp');

const mongoReadyStateMap = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

/**
 * The whole HTTP API. identity is what services/oidc/setup.js returns: authenticate (who is
 * calling) and sessionRouter (/session/* for the sites without a back end). Every route decides
 * for itself who may use it (docs/Auth-v2.md §3); a route without a guard is public.
 */
const buildApp = ({ identity, allowedOrigins, trustProxy = false }) => {
  const app = express();
  if (trustProxy) app.set('trust proxy', true);
  app.disable('x-powered-by');

  // Express leaves req.body undefined when a request has no parsed body,
  // and the routes read fields from it
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });

  // The vocabulary is public and called by apps without cookies, so it comes before the shared CORS
  app.use(
    '/dict/vocabulary/',
    cors({ methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }),
    express.json(),
    attachClientIp,
    dictVocabularyRouter,
  );

  // Nihongo Studio checks for updates without signing in
  app.use('/studio/updates/', studioUpdatesRouter);

  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
    }),
  );

  // Saves are larger than other requests, so they are parsed before the shared JSON parser
  app.use('/studio/save/', express.json({ limit: '5mb' }));
  app.use('/bp/sync/', express.json({ limit: '1mb' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachClientIp);

  // Who is calling: a Bearer access token (apps) or a token handler session (websites)
  app.use(identity.authenticate);
  // Session requests that change data must come from a listed site (docs/Session-API.md §4)
  app.use(requireTrustedOrigin(allowedOrigins));

  app.use(createLegacyRedirects());
  app.use('/session/', identity.sessionRouter);
  app.use('/me/', meRouter);
  app.use('/admin/profiles/', adminProfilesRouter);
  app.use('/internal/', internalRouter);
  app.use('/websites/', websitesRouter);
  app.use('/3dcgs/', threeDCGsRouter);
  app.use('/animations/', animationsRouter);
  app.use('/admin/', adminRouter);
  app.use('/contact/', contactRouter);
  app.use('/components/', componentsRouter);
  app.use('/reisui/codes/', reisuiRouter);
  app.use('/dict/admin/words/', dictWordsRouter);
  app.use('/studio/save/', studioSaveRouter);
  app.use('/bp/shared/', bpSharedRouter);
  app.use('/bp/', bpRouter);

  app.get('/', (req, res) => {
    res.send('ホームページへようこそ');
  });

  app.get('/test/', requireRole('admin'), (req, res) => {
    res.json({
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
    });
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

  app.use((req, res) => {
    res.status(404).send('404 - お探しのページは見つかりませんでした');
  });

  // Internal details go to the log only, never to the caller
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

  return app;
};

module.exports = { buildApp };
