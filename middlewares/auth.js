const jwt = require('jsonwebtoken');
const TokenBlackList = require('../models/token_blackList');

const publicRoutes = ['/login/', '/signup/', '/logout/', '/chat/', '/test/'];

async function verifyToken(req, res, next) {
  const url = req.originalUrl.split('?')[0];
  if (publicRoutes.includes(url)) {
    return next();
  }
  const token = req.cookies.access_token;
  if (!token) {
    return res.json({
      code: 403,
      msg: '請先登入',
    });
  }

  await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
    if (decoded) {
      req.user = decoded;
      const isTokenInBlackList = await TokenBlackList.findOne({ token });
      if (isTokenInBlackList) {
        return res.json({
          code: 403,
          msg: 'Token已失效，請重新登入',
        });
      }
      next();
    }
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.json({
          code: 403,
          msg: '登入逾時，請重新登入',
        });
      }
      return res.json({
        code: 403,
        msg: '請先登入',
      });
    }

    return null;
  });

  return null;
}

module.exports = { verifyToken };
