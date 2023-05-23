const jwt = require('jsonwebtoken');
const TokenBlackList = require('../models/token_blackList');
const User = require('../models/user');

const publicRoutes = [
  '/login/',
  '/signup/',
  '/logout/',
  '/chat/',
  '/test/',
  '/websites/[0-9a-fA-F]{24}/',
  '/websites/list/',
  '/3dcgs/list/',
  '/3dcgs/[0-9a-fA-F]{24}/',
  '/animations/list/',
  '/animations/[0-9a-fA-F]{24}/',
  '/admin/uploads/[^./]+.(jpg|jpeg|png|gif|webp)',
  '/contact/',
  '/websites/category/',
];

async function verifyToken(req, res, next) {
  const url = req.path;
  if (
    publicRoutes.some((route) => {
      const reg = new RegExp(`^${route}$`);
      return reg.test(url);
    })
  ) {
    return next();
  }
  const token = req.cookies.access_token;
  if (!token) {
    return res.status(403).send('Please login first');
  }

  await jwt.verify(token, process.env.SECRET_KEY, async (err, decoded) => {
    if (decoded) {
      req.user = decoded;
      const isTokenInBlackList = await TokenBlackList.findOne({ token });
      if (isTokenInBlackList) {
        return res.status(403).send('Login timeout, please login again');
      }
      // get user data from db
      try {
        const user = await User.findById(decoded.userId);
        if (!user) {
          return res.status(403).send('User not found');
        }
        req.user = user;
        next();
      } catch (error) {
        return res.status(500).send('db error');
      }
    } else {
      return res.status(403).send('Please login first');
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

  if (user && user.permissions.includes('general')) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

module.exports = {
  verifyToken,
  requireAdmin,
  requireUser,
};
