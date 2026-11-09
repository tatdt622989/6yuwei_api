const jwt = require('jsonwebtoken');
const TokenBlackList = require('../models/token_blackList');
const { User } = require('../models/user');

const LOGIN_FIRST = 'Please login first';
const LOGIN_TIMEOUT = 'Login timeout, please login again';

/**
 * The account a login token belongs to, or the reason it cannot be used.
 * Every place that accepts a login token goes through here.
 */
const sessionOf = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.SECRET_KEY, { algorithms: ['HS256'] });
  } catch (error) {
    return { error: error.name === 'TokenExpiredError' ? LOGIN_TIMEOUT : LOGIN_FIRST };
  }

  if (await TokenBlackList.findOne({ token: { $eq: token } })) {
    return { error: LOGIN_TIMEOUT };
  }
  const user = await User.findById(decoded.userId);
  if (!user) {
    return { error: 'User not found' };
  }
  // Tokens issued before this version field existed carry no version and count as 0
  if ((decoded.sv ?? 0) !== (user.sessionVersion ?? 0)) {
    return { error: LOGIN_TIMEOUT };
  }
  return { user, decoded };
};

module.exports = { sessionOf };
