const { sessionOf } = require('../services/authSession');

const publicRoutes = require('../config/publicRoutes');

const publicPatterns = publicRoutes.map((route) => new RegExp(`^${route}$`));

async function verifyToken(req, res, next) {
  const url = req.path;
  if (publicPatterns.some((pattern) => pattern.test(url))) {
    return next();
  }
  const token = req.cookies.access_token;
  if (!token) {
    return res.status(403).send('Please login first');
  }

  try {
    const { user, error } = await sessionOf(token);
    if (error) {
      return res.status(403).send(error);
    }
    req.user = user;
  } catch (error) {
    console.error('session check failed:', error);
    return res.status(500).send('db error');
  }
  return next();
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
