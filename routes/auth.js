/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const { requireUser, requireAdmin } = require('../middlewares/auth');

// models
const { User } = require('../models/user');
const TokenBlackList = require('../models/token_blackList');

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
          phone: user.phone ?? '',
          country: user.country ?? '',
          birth: user.birth ?? '',
          createdAt: user.createdAt,
        },
      });
    }
    return res.status(400).send('Incorrect password');
  }

  return res.status(400).send('User does not exist');
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
        return res.json({
          msg: 'Logged in',
          user: {
            _id: user.id,
            username: user.username,
            email: user.email,
            permissions: user.permissions,
            photo: user.photo,
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
            phone: user.phone ?? '',
            country: user.country ?? '',
            birth: user.birth ?? '',
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

module.exports = router;
