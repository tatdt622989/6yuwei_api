const jwt = require('jsonwebtoken');
const TokenBlackList = require('../models/token_blackList');
const { User } = require('../models/user');

const publicRoutes = [
  '/login/',
  '/signup/',
  '/logout/',
  '/loginStatus/',
  '/chat/',
  '/websites/[0-9a-fA-F]{24}/',
  '/websites/',
  '/3dcgs/',
  '/3dcgs/[0-9a-fA-F]{24}/',
  '/animations/[0-9a-fA-F]{24}/',
  '/animations/',
  '/admin/uploads/[^./]+.(jpg|jpeg|png|gif|webp)',
  '/contact/',
  '/3dcgs/category/',
  '/websites/category/',
  '/animations/category/',
  '/components/[0-9a-fA-F]{24}/',
  '/components/types/',
  '/components/css/[^./]+.css/',
  '/components/js/[^./]+.js/',
  '/components/sandbox/',
  '/components/',
  '/components/screenshot/[^./]+.png',
  '/components/types/cover/[^./]+.png',
  '/components/html2canvas.min.js',
  '/components/screenshot.js',
  '/components/screenshot_dev.js',
  '/googleLogin/',
  '/google/callback/',
  '/guessai_canvas/socket.io/',
  '/guessai_canvas/theme/',
  '/guessai_canvas/simple_user/',
  '/guessai_canvas/msg_list/',
  '/guessai_canvas/',
  '/guessai_canvas/canvas/',
  '/guessai_canvas/canvas/[0-9a-fA-F]{24}/',
  '/guessai_canvas/canvas_list/',
  '/guessai_canvas/ranking/',
  '/guessai_canvas/user_photo/[^./]+.(jpg|jpeg|png|gif|webp)/',
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
  if (user && user.id) {
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
