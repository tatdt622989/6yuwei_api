const express = require('express');

const router = express.Router({ strict: true });
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
// models
const User = require('../models/user');

const app = express();

const urlencodedParser = bodyParser.urlencoded({ extended: false });

// 跨域設定
const allowedOrigins = ['http://localhost:3000', 'https://6yuwei.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  }),
);

app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.static(path.resolve(__dirname, 'node_modules')));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// 註冊
router.post('/signup/', urlencodedParser, async (req, res) => {
  if (!req.body || !req.body.username || !req.body.password || !req.body.email) {
    return res.json({
      code: 400,
      msg: '請填寫完整資料',
    });
  }

  const {
    username, password, email, phone,
  } = req.body;

  // console.log(req.body);

  // 檢查用戶是否存在

  const existUser = await User.findOne({ email });
  if (existUser) {
    return res.json({
      code: 400,
      msg: '用戶已存在',
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
        msg: `註冊失敗-${err}`,
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
    msg: '註冊成功',
  });
});

// 登入
router.post('/login/', urlencodedParser, async (req, res) => {
  if (!req.body) {
    res.json({
      code: 400,
      msg: '請填寫完整資料',
    });
  }
  const { email, password } = req.body;

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
        msg: '登入成功',
      });
    }
  }

  return res.json({
    code: 400,
    msg: '用戶不存在',
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
