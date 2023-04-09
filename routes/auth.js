const express = require('express');

const router = express.Router({ strict: true });
const jwt = require('jsonwebtoken');
// models
const User = require('../models/user');
const TokenBlackList = require('../models/token_blackList');

// 註冊
router.post('/signup/', async (req, res) => {
  if (!req.body || !req.body.username || !req.body.password || !req.body.email) {
    return res.json({
      code: 400,
      msg: 'Please fill in the complete information',
    });
  }

  const {
    username, password, email, phone,
  } = req.body;

  // 檢查用戶是否存在

  const existUser = await User.findOne({ email });
  if (existUser) {
    return res.json({
      code: 400,
      msg: 'User already exists',
    });
  }

  // 儲存用戶
  const user = new User({
    username,
    email,
    phone,
    password,
  });

  await user
    .save()
    .catch((err) => {
      res.json({
        code: 500,
        msg: `Registration Failure-${err}`,
      });
    });

  // jwt token
  const token = user.generateAuthToken();

  res
    .cookie('access_token', token, {
      httpOnly: true, // 只能在伺服器端讀取cookie
      secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
      sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
    });

  return res.json({
    code: 200,
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

  if (!req.body || !email || !password) {
    return res.json({
      code: 400,
      msg: 'Please fill in the complete information',
    });
  }

  // 尋找用戶
  const user = await User.findOne({ email });

  if (user) {
    // 比對密碼
    const isMatch = await user.comparePassword(password);

    if (isMatch) {
      // jwt token
      const token = user.generateAuthToken();

      res
        .cookie('access_token', token, {
          httpOnly: true, // 只能在伺服器端讀取cookie
          secure: process.env.NODE_ENV === 'production', // 只在https下傳遞cookie
          sameSite: 'lax', // 可以在同一個網域下的子網域之間傳遞cookie
        });

      return res.json({
        code: 200,
        msg: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          permissions: user.permissions,
        },
      });
    }
    return res.json({
      code: 400,
      msg: 'Password Error',
    });
  }

  return res.json({
    code: 400,
    msg: 'User does not exist',
  });
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
            res.json({
              code: 500,
              msg: `Failure to log out-${dataErr}`,
            });
          });
        }
      }
      res.clearCookie('access_token');
    });
    return res.json({
      code: 200,
      msg: 'Successful logout',
    });
  }
  return res.json({
    code: 400,
    msg: 'Not in login status',
  });
});

// 確認登入狀態
router.get('/loginStatus/', async (req, res) => {
  const token = req.cookies.access_token;
  if (token) {
    await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
      if (decoded) {
        // console.log('decoded', decoded);
        req.user = decoded;
        const isTokenInBlackList = await TokenBlackList.findOne({ token });
        if (isTokenInBlackList) {
          return res.json({
            code: 403,
            msg: 'Token is no longer valid, please login again',
          });
        }
        // 尋找用戶
        const user = await User.findById(decoded.userId);
        return res.json({
          code: 200,
          msg: 'Logged in',
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            permissions: user.permissions,
          },
        });
      }
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.json({
            code: 403,
            msg: 'Login timeout, please login again',
          });
        }
        return res.json({
          code: 403,
          msg: 'Please login first',
        });
      }

      return null;
    });
  }
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
