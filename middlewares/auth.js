const jwt = require('jsonwebtoken');

const publicRoutes = ['/login/', '/signup/'];

function verifyToken(req, res, next) {
  const url = req.originalUrl;
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

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.json({
      code: 403,
      msg: '請先登入',
    });
  }

  return null;
}

module.exports = { verifyToken };
