/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const passport = require('passport');
const { createImageStorage, imageFileFilter } = require('../middlewares/upload');

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth'); // 引入 apple-signin-auth
const { requireUser } = require('../middlewares/auth');
const { limitRequestsByIp } = require('../middlewares/rateLimit');
const { isText } = require('../services/text');

// models
const { User } = require('../models/user');
const TokenBlackList = require('../models/token_blackList');
const StudioSave = require('../models/studioSave');
const { removeAccountData: removeBloodPressureData } = require('../services/bpSync');

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.FRONTEND_DOMAIN}api/google/callback/`,
    state: false,
  },
  ((accessToken, refreshToken, profile, cb) => {
    // The account is found by email, so the email must be one Google has confirmed
    if (profile.emails?.[0]?.verified === false) {
      cb(null, false);
      return;
    }
    User.findOrCreateByEmail(profile.emails[0].value, {
      username: profile.displayName,
      externalPhoto: profile.photos[0].value,
    }).then((user) => cb(null, user), cb);
  }),
));

// multer 設定
const adminStorage = createImageStorage({
  destination: (req) => {
    const { user } = req;
    const { id } = user;
    return path.join(__dirname, `../uploads/user/${id}/img/`);
  },
  filenamePrefix: (req) => req.user?.id || 'user',
});

const upload = multer({
  storage: adminStorage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 1024 * 1024 * 5 },
  encoding: 'utf-8',
});

const MINUTE = 60 * 1000;

// Website visitors can share one address behind a proxy,
// so the tight limit counts one account per address
const limitLoginByIp = limitRequestsByIp({ scope: 'login', maxRequests: 100, windowMs: 15 * MINUTE });
const limitLoginByAccount = limitRequestsByIp({
  scope: 'login-account',
  maxRequests: 10,
  windowMs: 15 * MINUTE,
  keyOf: (req) => String(req.body?.email).toLowerCase().slice(0, 254),
});
const limitSignup = limitRequestsByIp({ scope: 'signup', maxRequests: 20, windowMs: 60 * MINUTE });
const limitSocialLogin = limitRequestsByIp({ scope: 'social-login', maxRequests: 60, windowMs: 15 * MINUTE });

const LOGIN_FAILED = 'Incorrect email or password';

const REMEMBERED_SESSION = '30d';
const REMEMBERED_SESSION_MS = 30 * 24 * 60 * MINUTE;

/**
 * Signs the user in with the access_token cookie. `remember` keeps the session across app
 * restarts, which installed PWAs need because they can lose session cookies when closed.
 */
const startCookieSession = (res, user, remember) => {
  const token = remember === true
    ? user.generateAuthToken(REMEMBERED_SESSION)
    : user.generateAuthToken();

  res.cookie('access_token', token, {
    httpOnly: true, // 只能在伺服器端讀取cookie
    secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
    sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
    ...(remember === true ? { maxAge: REMEMBERED_SESSION_MS } : {}),
  });
};

// 註冊
router.post('/signup/', limitSignup, async (req, res) => {
  const {
    username, email, password, remember,
  } = req.body;
  if (!isText(username) || !isText(email) || !isText(password)) {
    return res.status(400).send('Please fill in the complete information');
  }

  if (!validator.isEmail(email)) {
    return res.status(400).send('Please enter a valid email address');
  }

  // 檢查用戶是否存在
  const existUser = await User.findOne({ email: { $eq: email } });
  if (existUser) {
    return res.status(400).send('User already exists');
  }

  // 儲存用戶
  const user = new User({
    username,
    email,
    phone: '',
    password,
  });

  try {
    await user.save();
  } catch (err) {
    console.error('Registration failure:', err);
    return res.status(500).send('Registration Failure');
  }

  startCookieSession(res, user, remember);

  return res.json({
    msg: 'Register successfully',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      permissions: user.permissions,
    },
  });
});

// 登入
router.post('/login/', limitLoginByIp, limitLoginByAccount, async (req, res) => {
  const { email, password, remember } = req.body;

  if (!isText(email) || !isText(password) || !validator.isEmail(email)) {
    return res.status(400).send('Please fill in the complete information');
  }

  // 尋找用戶
  const user = await User.findOne({ email: { $eq: email } });

  if (user) {
    // 比對密碼
    const isMatch = await user.comparePassword(password);

    if (isMatch) {
      startCookieSession(res, user, remember);

      return res.json({
        msg: 'Login successful',
        user: {
          _id: user.id,
          username: user.username,
          email: user.email,
          permissions: user.permissions,
          photo: user.photo,
          externalPhoto: user.externalPhoto,
          phone: user.phone ?? '',
          country: user.country ?? '',
          birth: user.birth ?? '',
          createdAt: user.createdAt,
          balance: user.balance,
        },
      });
    }
  }

  return res.status(400).send(LOGIN_FAILED);
});

// Google 登入
router.get('/googleLogin/', passport.authenticate('google', { session: false, scope: ['email', 'profile'] }));

// Google 登入 callback
router.get('/google/callback/', passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_DOMAIN}admin/login/` }), async (req, res) => {
  const { user } = req;
  // jwt token
  const token = user.generateAuthToken();

  res.cookie('access_token', token, {
    httpOnly: true, // 只能在伺服器端讀取cookie
    secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
    sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
  });

  // 用 JS redirect 而非 HTTP 302，確保 Set-Cookie 能穿透 Nuxt proxy
  const redirectUrl = `${process.env.FRONTEND_DOMAIN}admin/account/`;
  res.send(`<html><body><script>window.location.href='${redirectUrl}'</script></body></html>`);
});

// Google sign-in for the blood pressure PWA. The session cookie has to live on this host,
// so this flow returns here directly rather than through the main site's proxy.
const BP_APP_URL = (process.env.BP_APP_URL || 'https://bp.6yuwei.com').replace(/\/$/, '');
const BP_GOOGLE_CALLBACK = process.env.BP_GOOGLE_CALLBACK_URL
  || 'https://api.6yuwei.com/bp/google/callback/';
const BP_GOOGLE_STATE_COOKIE = 'bp_google_state';
const bpGoogleStateCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/bp/google/',
};

const sameState = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

router.get('/bp/google/', limitSocialLogin, (req, res, next) => {
  // Ties the answer from Google to this browser, so nobody can sign someone else in to their account
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(BP_GOOGLE_STATE_COOKIE, state, { ...bpGoogleStateCookie, maxAge: 10 * MINUTE });
  passport.authenticate('google', {
    session: false,
    scope: ['email', 'profile'],
    callbackURL: BP_GOOGLE_CALLBACK,
    prompt: 'select_account',
    state,
  })(req, res, next);
});

router.get('/bp/google/callback/', limitSocialLogin, (req, res, next) => {
  const fail = () => res.redirect(`${BP_APP_URL}/login?google=failed`);
  const expected = req.cookies[BP_GOOGLE_STATE_COOKIE];
  res.clearCookie(BP_GOOGLE_STATE_COOKIE, bpGoogleStateCookie);
  if (!sameState(req.query.state, expected)) return fail();
  return passport.authenticate('google', {
    session: false,
    callbackURL: BP_GOOGLE_CALLBACK,
  }, (error, user) => {
    if (error || !user) return fail();
    startCookieSession(res, user, true);
    return res.redirect(`${BP_APP_URL}/`);
  })(req, res, next);
});

// App 專用 CORS 設定
const appCorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    // 允許常見的 App Origin 以及 localhost
    const allowedAppOrigins = [
      'capacitor://localhost',
      'ionic://localhost',
      'http://localhost',
      'https://localhost',
    ];

    let hostname = '';
    try {
      hostname = new URL(origin).hostname;
    } catch (err) {
      return callback(null, false);
    }

    if (allowedAppOrigins.includes(origin) || hostname === '127.0.0.1') {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'credentials'],
  credentials: true,
};

// 將 App 專用 CORS 套用至所有的 /app/* 路由
router.use('/app', cors(appCorsOptions));

// App 登入 (直接回傳 token)
router.post('/app/login/', limitLoginByIp, limitLoginByAccount, async (req, res) => {
  const { email, password } = req.body;

  if (!isText(email) || !isText(password) || !validator.isEmail(email)) {
    return res.status(400).send('Please fill in the complete information');
  }

  // 尋找用戶
  const user = await User.findOne({ email: { $eq: email } });

  if (user) {
    // 比對密碼
    const isMatch = await user.comparePassword(password);

    if (isMatch) {
      // jwt token
      const token = user.generateAuthToken();

      return res.json({
        msg: 'Login successful',
        token,
      });
    }
  }

  return res.status(400).send(LOGIN_FAILED);
});

function googleClientIdOf(platform) {
  if (platform === 'android') return process.env.GOOGLE_ANDROID_CLIENT_ID;
  if (platform === 'desktop') return process.env.GOOGLE_DESKTOP_CLIENT_ID;
  return process.env.GOOGLE_IOS_CLIENT_ID;
}

// App Google 登入
router.post('/app/googleLogin/', limitSocialLogin, async (req, res) => {
  const { idToken, platform } = req.body;
  // 根據 platform 來決定使用不同的 client ID
  const clientId = googleClientIdOf(platform);
  const client = new OAuth2Client(clientId);

  if (!idToken) {
    return res.status(400).send('Please provided idToken');
  }

  // 沒有 audience 時，verifyIdToken 不會檢查這張 token 是發給哪個應用程式的
  if (!clientId) {
    return res.status(503).send('Google login is not configured for this platform');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    // The account is found by email, so the email must be one Google has confirmed
    if (!email || payload.email_verified === false) {
      return res.status(400).send('Google verification failed');
    }

    const user = await User.findOrCreateByEmail(email, {
      username: name,
      externalPhoto: picture,
    });

    // jwt token
    const token = user.generateAuthToken();

    return res.json({
      msg: 'Login successful',
      token,
      user: {
        _id: user.id,
        username: user.username,
        email: user.email,
        permissions: user.permissions,
        photo: user.photo,
        externalPhoto: user.externalPhoto,
        phone: user.phone ?? '',
        country: user.country ?? '',
        birth: user.birth ?? '',
        createdAt: user.createdAt,
        balance: user.balance,
      },
    });
  } catch (error) {
    console.error('Google verification error:', error);
    if (error.message && error.message.includes('Login Failure')) {
      return res.status(500).send(error.message);
    }
    return res.status(400).send('Google verification failed');
  }
});

// App Apple 登入
router.post('/app/appleLogin/', limitSocialLogin, async (req, res) => {
  const {
    identityToken, authorizationCode, platform, name,
  } = req.body;

  if (!identityToken) {
    return res.status(400).send('Please provide identityToken');
  }

  // 根據 platform 來決定使用不同的 client ID
  let clientId = process.env.APPLE_CLIENT_ID;
  if (platform === 'ios') clientId = process.env.APPLE_IOS_CLIENT_ID;
  else if (platform === 'android') clientId = process.env.APPLE_ANDROID_CLIENT_ID;
  else if (platform === 'web') clientId = process.env.APPLE_WEB_CLIENT_ID;

  // Without an audience, a token issued to any other app would pass verification
  if (!clientId) {
    return res.status(503).send('Apple login is not configured for this platform');
  }

  try {
    // 1. 驗證 Apple Token
    const payload = await appleSignin.verifyIdToken(identityToken, { audience: clientId });

    const appleId = payload.sub;
    // Only the signed token decides the email. The request body can hold anything the caller types
    const isVerified = payload.email_verified === true || payload.email_verified === 'true';
    const verifiedEmail = typeof payload.email === 'string' && isVerified ? payload.email : '';

    // 2. 尋找或創建用戶
    let user = await User.findOne({ appleId: { $eq: appleId } });
    if (!user && verifiedEmail) {
      user = await User.findOne({ email: { $eq: verifiedEmail } });
      if (user?.appleId) {
        return res.status(409).send('This email is linked to another Apple account');
      }
      // 如果找到了但尚未綁定 appleId，則綁定
      if (user) user.appleId = appleId;
    }
    if (!user) {
      // 如果找不到，自動註冊一個新帳號
      user = await User.create({
        username: isText(name) ? name : 'Apple User',
        email: verifiedEmail || `${appleId}@apple.com`, // 提供預設 dummy email 防止報錯
        appleId,
      });
    }

    // 3. (如果有授權碼) 換取並儲存 Refresh Token 供未來刪除帳號用
    if (authorizationCode) {
      try {
        const clientSecret = appleSignin.getClientSecret({
          clientID: clientId,
          teamID: process.env.APPLE_TEAM_ID,
          keyIdentifier: process.env.APPLE_KEY_ID,
          privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
        });

        const tokenResponse = await appleSignin.getAuthorizationToken(authorizationCode, {
          clientID: clientId,
          clientSecret,
        });

        if (tokenResponse && tokenResponse.refresh_token) {
          user.appleRefreshToken = tokenResponse.refresh_token;
        }
      } catch (tokenErr) {
        console.error('Apple exchange token error:', tokenErr);
      }
    }

    await user.save();

    // 4. 核發專案 Token
    const token = user.generateAuthToken();

    return res.json({
      msg: 'Login success',
      token,
      user: {
        _id: user.id,
        username: user.username,
        email: user.email,
        appleId: user.appleId,
        permissions: user.permissions,
        photo: user.photo,
        externalPhoto: user.externalPhoto,
        phone: user.phone ?? '',
        country: user.country ?? '',
        birth: user.birth ?? '',
        createdAt: user.createdAt,
        balance: user.balance,
      },
    });
  } catch (error) {
    console.error('Apple verification error:', error);
    return res.status(400).send('Invalid token');
  }
});

// 登出
router.post('/logout/', async (req, res) => {
  const token = req.cookies.access_token;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        // check if the token is in the blacklist
        const isTokenExist = await TokenBlackList.findOne({ token });
        // if not, add it to the blacklist
        if (!isTokenExist) {
          const tokenBlackList = new TokenBlackList({
            token,
            expiresAt: new Date(decoded.exp * 1000),
            issuedAt: new Date(decoded.iat * 1000),
          });
          await tokenBlackList.save().catch((dataErr) => {
            res.status(500).send(`Logout Failure-${dataErr}`);
          });
        }
      }
      res.clearCookie('access_token');
    });
    return res.json({
      msg: 'Successful logout',
    });
  }
  return res.status(400).send('Please login first');
});

// App 登出
router.post('/app/logout/', async (req, res) => {
  const { token } = req.body;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        // check if the token is in the blacklist
        const isTokenExist = await TokenBlackList.findOne({ token });
        // if not, add it to the blacklist
        if (!isTokenExist) {
          const tokenBlackList = new TokenBlackList({
            token,
            expiresAt: new Date(decoded.exp * 1000),
            issuedAt: new Date(decoded.iat * 1000),
          });
          await tokenBlackList.save().catch((dataErr) => {
            res.status(500).send(`Logout Failure-${dataErr}`);
          });
        }
      }
      res.clearCookie('access_token');
    });
    return res.json({
      msg: 'Successful logout',
    });
  }
  return res.status(400).send('Please login first');
});

// 確認登入狀態
router.get('/loginStatus/', async (req, res) => {
  const token = req.cookies.access_token;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        req.user = decoded;
        const isTokenInBlackList = await TokenBlackList.findOne({ token });
        if (isTokenInBlackList) {
          return res.status(403).send('Login timeout, please login again');
        }
        // 尋找用戶
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(403).send('User not found');
        }
        return res.json({
          msg: 'Logged in',
          user: {
            _id: user.id,
            username: user.username,
            email: user.email,
            permissions: user.permissions,
            photo: user.photo,
            externalPhoto: user.externalPhoto,
            phone: user.phone ?? '',
            country: user.country ?? '',
            birth: user.birth ?? '',
            createdAt: user.createdAt,
            balance: user.balance,
          },
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
  }
  return res.json({
    status: 403,
    msg: 'Not logged in yet',
  });
});

// 取得特定用戶資料
router.get('/user/', async (req, res) => {
  const token = req.cookies.access_token;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        // console.log('decoded', decoded);
        req.user = decoded;
        const isTokenInBlackList = await TokenBlackList.findOne({ token });
        if (isTokenInBlackList) {
          return res.status(403).send('Login timeout, please login again');
        }
        // 尋找用戶
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(403).send('User not found');
        }
        return res.json({
          msg: 'Success',
          user: {
            _id: user.id,
            username: user.username,
            email: user.email,
            permissions: user.permissions,
            photo: user.photo ?? '',
            phone: user.phone ?? '',
            country: user.country ?? '',
            birth: user.birth ?? '',
            balance: user.balance,
            createdAt: user.createdAt,
          },
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
  }
  return res.status(403).send('Please login first');
});

// 修改用戶資料
router.put('/user/', upload.single('photo'), async (req, res) => {
  if (req.fileError) {
    return res.status(400).send(req.fileError);
  }

  const token = req.cookies.access_token;
  const userPhotoName = req && req.file && req.file.filename;
  const {
    username, phone, country, birth,
  } = req.body;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        // console.log('decoded', decoded);
        req.user = decoded;
        const isTokenInBlackList = await TokenBlackList.findOne({ token });
        if (isTokenInBlackList) {
          return res.status(403).send('Login timeout, please login again');
        }
        // 修改用戶資料
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(403).send('User not found');
        }
        user.username = username ?? '';
        user.phone = phone ?? '';
        user.country = country ?? '';
        user.birth = birth ?? '';
        if (userPhotoName) {
          try {
            // delete old photo
            fs.unlinkSync(path.join(__dirname, `../uploads/user/${user.id}/img/${user.photo}`));
          } catch (error) {
            console.log('delete old photo error', error);
          }
          user.photo = userPhotoName;
        }
        await user.save();
        return res.json({
          msg: 'Success',
          user: {
            _id: user.id,
            username: user.username,
            email: user.email,
            permissions: user.permissions,
            photo: user.photo ?? '',
            externalPhoto: user.externalPhoto ?? '',
            phone: user.phone ?? '',
            country: user.country ?? '',
            birth: user.birth ?? '',
            balance: user.balance,
            createdAt: user.createdAt,
          },
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
  }
  return res.status(403).send('Please login first');
});

// 取得用戶餘額
router.get('/user/balance/', requireUser, async (req, res) => {
  const user = await User.findById(req.user._id);
  return res.json({
    msg: 'Success',
    balance: user.balance,
  });
});

// hash generator
// router.post('/hash/', urlencodedParser, (req, res) => {
//   if (!req.body) res.send('請填寫完整資料');
//   const { password } = req.body;
//   bcrypt.hash(password, 10).then((hash) => {
//     res.send(hash);
//   });
// });

// App 刪除用戶與撤銷 Apple 授權
router.post('/app/deleteUser/', async (req, res) => {
  const { token, platform } = req.body;

  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (err || !decoded) {
        return res.status(403).send('Please login first');
      }

      // 檢查 Token 黑名單
      const isTokenInBlackList = await TokenBlackList.findOne({ token });
      if (isTokenInBlackList) {
        return res.status(403).send('Login timeout, please login again');
      }

      try {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(403).send('User not found');
        }

        // --- 若為 Apple 登入用戶，執行撤銷授權 ---
        if (user.appleId && user.appleRefreshToken) {
          let clientId = process.env.APPLE_CLIENT_ID;
          if (platform === 'ios') clientId = process.env.APPLE_IOS_CLIENT_ID;
          else if (platform === 'android') clientId = process.env.APPLE_ANDROID_CLIENT_ID;
          else if (platform === 'web') clientId = process.env.APPLE_WEB_CLIENT_ID;

          const hasEnvs = process.env.APPLE_PRIVATE_KEY_PATH
            && process.env.APPLE_TEAM_ID
            && process.env.APPLE_KEY_ID;

          if (hasEnvs) {
            try {
              const clientSecret = appleSignin.getClientSecret({
                clientID: clientId,
                teamID: process.env.APPLE_TEAM_ID,
                keyIdentifier: process.env.APPLE_KEY_ID,
                privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
              });

              await appleSignin.revokeAuthorizationToken(user.appleRefreshToken, {
                clientID: clientId,
                clientSecret,
              });
            } catch (revokeErr) {
              console.error('Apple revoke error:', revokeErr);
              // 記錄錯誤，但繼續刪除使用者帳號，以免卡住
            }
          } else {
            console.warn('Apple App Delete: Missing environment variables for Client Secret generation. Skipping Revoke.');
          }
        }

        // --- 執行本機資料庫使用者刪除 ---
        await User.findByIdAndDelete(user._id);
        await StudioSave.deleteOne({ _id: String(user._id) });
        await removeBloodPressureData(user._id);

        // 將這把 Token 加入黑名單
        const tokenBlackList = new TokenBlackList({
          token,
          expiresAt: new Date(decoded.exp * 1000),
          issuedAt: new Date(decoded.iat * 1000),
        });
        await tokenBlackList.save().catch((dataErr) => console.error(`Delete failure adding to blacklist - ${dataErr}`));

        return res.json({
          msg: 'User deleted successfully',
        });
      } catch (dbErr) {
        console.error(dbErr);
        return res.status(500).send('Database error during deletion');
      }
    });
    return null;
  }
  return res.status(400).send('Please login first');
});

module.exports = router;
