/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const passport = require('passport');

const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { OAuth2Client } = require('google-auth-library');
const appleSignin = require('apple-signin-auth'); // 引入 apple-signin-auth
const { requireUser } = require('../middlewares/auth');

// models
const { User } = require('../models/user');
const TokenBlackList = require('../models/token_blackList');

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.FRONTEND_DOMAIN}api/google/callback/`,
  },
  ((accessToken, refreshToken, profile, cb) => {
    User.findOrCreate(
      { email: profile.emails[0].value },
      {
        username: profile.displayName,
        externalPhoto: profile.photos[0].value,
      },
      (err, user) => cb(err, user),
    );
  }),
));

// multer 設定
const adminStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { user } = req;
      const { id } = user;
      const uploadPath = path.join(__dirname, `../uploads/user/${id}/img/`);
      // 檢查目錄是否存在，如果不存在則創建目錄
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    } catch (err) {
      console.error(err);
      cb(err, null);
    }
  },
  filename: (req, file, cb) => {
    try {
      let filename = file.originalname;
      filename = Buffer.from(filename, 'latin1').toString('utf8');
      cb(null, filename);
    } catch (err) {
      console.error(err);
      cb(err, null);
    }
  },
});

/**
 * 如果文件不是圖片，則返回錯誤。否則，調用回調函數。
 * @param req - HTTP 請求對象。
 * @param file - 剛上傳的文件。
 * @param cb - 回調函數。
 */
const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image')) {
    cb(new Error('Not an image! Please upload an image.'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: adminStorage,
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 5 },
  encoding: 'utf-8',
});

// 註冊
router.post('/signup/', async (req, res) => {
  const { username, email, password } = req.body;
  if (
    (username && validator.isEmpty(username))
    || (email && validator.isEmpty(email))
    || (password && validator.isEmpty(password))
  ) {
    return res.status(400).send('Please fill in the complete information');
  }

  if (!validator.isEmail(email)) {
    return res.status(400).send('Please enter a valid email address');
  }

  // 檢查用戶是否存在
  const existUser = await User.findOne({ email });
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

  await user.save().catch((err) => {
    res.status(500).send(`Registration Failure-${err}`);
  });

  // jwt token
  const token = user.generateAuthToken();

  res.cookie('access_token', token, {
    httpOnly: true, // 只能在伺服器端讀取cookie
    secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
    sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
  });

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
router.post('/login/', async (req, res) => {
  const { email, password } = req.body;

  if (
    !req.body
    || !email
    || !password
    || validator.isEmpty(email)
    || validator.isEmpty(password)
    || !validator.isEmail(email)
  ) {
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

      res.cookie('access_token', token, {
        httpOnly: true, // 只能在伺服器端讀取cookie
        secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
        sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
      });

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
    return res.status(400).send('Incorrect password');
  }

  return res.status(400).send('User does not exist');
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

  res.redirect(`${process.env.FRONTEND_DOMAIN}admin/account/`);
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

    if (allowedAppOrigins.includes(origin) || origin.includes('127.0.0.1')) {
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
router.post('/app/login/', async (req, res) => {
  const { email, password } = req.body;

  if (
    !req.body
    || !email
    || !password
    || validator.isEmpty(email)
    || validator.isEmpty(password)
    || !validator.isEmail(email)
  ) {
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
    return res.status(400).send('Incorrect password');
  }

  return res.status(400).send('User does not exist');
});

// App Google 登入
router.post('/app/googleLogin/', async (req, res) => {
  const { idToken, platform } = req.body;
  // 根據 platform 來決定使用不同的 client ID
  const clientId = platform === 'android' ? process.env.GOOGLE_ANDROID_CLIENT_ID : process.env.GOOGLE_IOS_CLIENT_ID;
  const client = new OAuth2Client(clientId);

  if (!idToken) {
    return res.status(400).send('Please provided idToken');
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    const user = await new Promise((resolve, reject) => {
      User.findOrCreate(
        { email },
        {
          username: name,
          externalPhoto: picture,
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        },
      );
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
router.post('/app/appleLogin/', async (req, res) => {
  const {
    identityToken, authorizationCode, platform, email, name,
  } = req.body;

  if (!identityToken) {
    return res.status(400).send('Please provide identityToken');
  }

  // 根據 platform 來決定使用不同的 client ID
  let clientId = process.env.APPLE_CLIENT_ID;
  if (platform === 'ios') clientId = process.env.APPLE_IOS_CLIENT_ID;
  else if (platform === 'android') clientId = process.env.APPLE_ANDROID_CLIENT_ID;
  else if (platform === 'web') clientId = process.env.APPLE_WEB_CLIENT_ID;

  try {
    // 1. 驗證 Apple Token
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: clientId,
      ignoreExpiration: true,
    });

    const appleId = payload.sub;
    const userEmail = email || payload.email;

    // 2. 尋找或創建用戶
    const user = await new Promise((resolve, reject) => {
      User.findOne({ $or: [{ appleId }, { email: userEmail }] }).then((doc) => {
        if (doc) {
          // 如果找到了但尚未綁定 appleId，則綁定
          // eslint-disable-next-line no-param-reassign
          if (!doc.appleId) doc.appleId = appleId;
          resolve(doc);
        } else {
          // 如果找不到，自動註冊一個新帳號
          User.create({
            username: name || 'Apple User',
            email: userEmail || `${appleId}@apple.com`, // 提供預設 dummy email 防止報錯
            appleId,
          }).then((newUser) => resolve(newUser)).catch(reject);
        }
      }).catch(reject);
    });

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
