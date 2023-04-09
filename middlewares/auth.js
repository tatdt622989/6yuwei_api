const jwt = require('jsonwebtoken');
const TokenBlackList = require('../models/token_blackList');
const User = require('../models/user');

const publicRoutes = ['/login/', '/signup/', '/logout/', '/chat/', '/test/', '/websites/list/', '/admin/uploads/'];

async function verifyToken(req, res, next) {
  const url = req.originalUrl.split('?')[0];
  if (publicRoutes.some((route) => url.startsWith(route))) {
    return next();
  }
  const token = req.cookies.access_token;
  if (!token) {
    return res.json({
      code: 403,
      msg: 'Please login first',
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
      // get user data from db
      try {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.json({
            code: 403,
            msg: 'User not found',
          });
        }
        req.user = user;
        next();
      } catch (error) {
        return res.json({
          code: 500,
          msg: 'db error',
        });
      }
    } else {
      return res.json({
        code: 403,
        msg: 'Please login first',
      });
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

/**
 * If the user exists and the user's permissions include 'admin',
 * then call next(), otherwise return a 401 error
 * @param req - The request object
 * @param res - the response object
 * @param next - a function that will be called when the middleware is complete.
 */
const requireAdmin = (req, res, next) => {
  const { user } = req;

  if (user && user.permissions.includes('admin')) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

/**
 * If the user exists and has the 'user' permission,
 * then call the next function. Otherwise, return a 401 error
 * @param req - The request object
 * @param res - The response object.
 * @param next - a function that will be called when the middleware is complete.
 */
const requireUser = (req, res, next) => {
  const { user } = req;

  if (user && user.permissions.includes('user')) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = { verifyToken, requireAdmin, requireUser };
