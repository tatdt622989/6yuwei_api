/* eslint-disable no-underscore-dangle */
const crypto = require('crypto');
const validator = require('validator');
const { User } = require('../models/user');
const AccountToken = require('../models/accountToken');
const { consumeQuota } = require('../middlewares/rateLimit');
const { isText } = require('./text');
const { sendMail } = require('./mail');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const VERIFY_CODE_MINUTES = 15;
const RESET_LINK_LIFETIME = HOUR;
const MAILS_PER_ADDRESS_PER_HOUR = 5;
const TRIES_PER_CODE = 5;
const CODE_TRIES_PER_ADDRESS_PER_DAY = 20;
const INVALID_CODE = 'Invalid or expired code';
const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignores everything after this many bytes
const MAX_PASSWORD_BYTES = 72;
const TOKEN_FORMAT = /^[a-f0-9]{64}$/;
const CODE_FORMAT = /^\d{6}$/;

const normalizeEmail = (email) => String(email).trim().toLowerCase();

const passwordProblem = (password) => {
  if (!isText(password) || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return '';
};

/** True while a new account waits for the code emailed to its address. */
const awaitsVerification = (user) => user.verificationRequired === true && !user.emailVerifiedAt;

/** The account for this address. Older accounts can hold capitals, so the case is ignored. */
const findByEmail = async (email) => {
  const typed = String(email).trim();
  const exact = await User.findOne({ email: { $eq: typed } });
  if (exact) return exact;
  const lower = typed.toLowerCase();
  return await User.findOne({ email: { $eq: lower } })
    || User.findOne({ email: { $eq: lower } })
      .collation({ locale: 'en', strength: 2 })
      .sort({ createdAt: 1 });
};

/** Where the "back to sign-in" link goes. A request can only name a known app. */
const loginUrlOf = (app) => {
  if (app === 'bp') {
    return `${(process.env.BP_APP_URL || 'https://bp.6yuwei.com').replace(/\/$/, '')}/login`;
  }
  return `${process.env.FRONTEND_DOMAIN || 'https://6yuwei.com/'}admin/login/`;
};

const appOf = (app) => (app === 'bp' ? 'bp' : 'main');

const hashOf = (token) => crypto.createHash('sha256').update(token).digest('hex');

const accountPageUrl = (page, token, app) => {
  const base = (process.env.ACCOUNT_BASE_URL || 'https://api.6yuwei.com').replace(/\/$/, '');
  return `${base}/account/${page}/?token=${token}&app=${app}`;
};

/** Replaces any earlier link, so only the newest email works. */
const issueResetToken = async (user, app) => {
  await AccountToken.deleteMany({ userId: user._id, purpose: 'reset-password' });
  const token = crypto.randomBytes(32).toString('hex');
  await AccountToken.create({
    userId: user._id,
    purpose: 'reset-password',
    app,
    tokenHash: hashOf(token),
    expiresAt: new Date(Date.now() + RESET_LINK_LIFETIME),
  });
  return token;
};

/** The link can be used once. Returns the record, or null when it is unknown, used or expired. */
const consumeResetToken = (token) => {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
  return AccountToken.findOneAndDelete({
    tokenHash: hashOf(token),
    purpose: 'reset-password',
    expiresAt: { $gt: new Date() },
  });
};

// A six-digit code is easy to try in full, so its hash needs the server secret.
// The account id keeps equal codes on two accounts from colliding in the unique index.
const codeHashOf = (user, code) => crypto
  .createHmac('sha256', process.env.SECRET_KEY)
  .update(`${user._id}:${code}`)
  .digest('hex');

/** Replaces any earlier code, so only the newest email works. */
const issueVerificationCode = async (user) => {
  await AccountToken.deleteMany({ userId: user._id, purpose: 'verify-email' });
  const code = String(crypto.randomInt(1000000)).padStart(6, '0');
  await AccountToken.create({
    userId: user._id,
    purpose: 'verify-email',
    tokenHash: codeHashOf(user, code),
    expiresAt: new Date(Date.now() + VERIFY_CODE_MINUTES * MINUTE),
  });
  return code;
};

/** Counts the try before comparing, so parallel requests cannot get extra guesses. */
const useVerificationCode = async (user, code) => {
  if (typeof code !== 'string' || !CODE_FORMAT.test(code)) return false;
  const record = await AccountToken.findOneAndUpdate(
    {
      userId: user._id,
      purpose: 'verify-email',
      expiresAt: { $gt: new Date() },
      attempts: { $lt: TRIES_PER_CODE },
    },
    { $inc: { attempts: 1 } },
  );
  if (!record || record.tokenHash !== codeHashOf(user, code)) return false;
  const { deletedCount } = await AccountToken.deleteOne({ _id: record._id });
  return deletedCount === 1;
};

const hasMailQuota = (email) => consumeQuota({
  scope: 'account-mail',
  key: normalizeEmail(email),
  maxRequests: MAILS_PER_ADDRESS_PER_HOUR,
  windowMs: HOUR,
});

const sendVerificationMail = async (user) => {
  const code = await issueVerificationCode(user);
  await sendMail({
    to: user.email,
    subject: `${code} 是你的 6yuwei 驗證碼`,
    html: `<p>有人用這個信箱註冊 6yuwei 帳號。如果是你本人，請在註冊畫面輸入下面的驗證碼，${VERIFY_CODE_MINUTES} 分鐘內有效。</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
<p>請不要把驗證碼告訴任何人，6yuwei 不會向你索取。如果不是你註冊的，不需要做任何事。</p>`,
  });
};

const sendResetMail = async (user, app) => {
  const token = await issueResetToken(user, app);
  await sendMail({
    to: user.email,
    subject: '重設你的 6yuwei 帳號密碼',
    html: `<p>有人要求重設這個帳號的密碼。如果是你本人，請在 1 小時內開啟下面的連結。</p>
<p><a href="${accountPageUrl('reset-password', token, app)}">重設密碼</a></p>
<p>如果不是你要求的，請不要開啟連結，你的密碼不會改變。</p>`,
  });
};

/**
 * Creates an account that cannot sign in until someone enters the code sent to its address.
 * Signing up again before that replaces the details, so the owner can take over an address that
 * someone else typed first.
 */
const registerWithPassword = async ({ username, email, password }) => {
  if (!validator.isEmail(String(email).trim())) {
    return { error: 'Please enter a valid email address', status: 400 };
  }
  const problem = passwordProblem(password);
  if (problem) return { error: problem, status: 400 };

  const address = normalizeEmail(email);
  const existing = await findByEmail(address);
  if (existing && !awaitsVerification(existing)) {
    return { error: 'User already exists', status: 400 };
  }
  if (!hasMailQuota(address)) {
    return { error: 'too many requests', status: 429 };
  }

  let user = existing;
  if (user) {
    user.username = username;
    user.password = password;
    await user.save();
  } else {
    try {
      user = await User.create({
        username, email: address, phone: '', password, verificationRequired: true,
      });
    } catch (error) {
      if (error.code === 11000) return { error: 'User already exists', status: 400 };
      throw error;
    }
  }

  try {
    await sendVerificationMail(user);
  } catch (error) {
    console.error('verification mail failed:', error.message);
    return { error: 'Verification email could not be sent', status: 503 };
  }
  return { user };
};

const markOwnerConfirmed = (user) => {
  /* eslint-disable no-param-reassign */
  user.emailVerifiedAt = new Date();
  user.verificationRequired = false;
  /* eslint-enable no-param-reassign */
};

/**
 * Google or Apple has just confirmed that the person owns this address. Until now nobody had,
 * so a password on the account may belong to someone else who signed up first: remove it and
 * end every session it started. The owner can set a new password from the reset page.
 */
const claimAccount = async (user) => {
  if (user.emailVerifiedAt) return user;
  if (user.password) {
    /* eslint-disable no-param-reassign */
    user.password = undefined;
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    /* eslint-enable no-param-reassign */
  }
  markOwnerConfirmed(user);
  await user.save();
  await AccountToken.deleteMany({ userId: user._id, purpose: 'verify-email' });
  return user;
};

/** The account for an address Google has confirmed, created from fields when there is none. */
const signInWithConfirmedEmail = async (email, fields) => {
  const existing = await findByEmail(email);
  if (existing) return claimAccount(existing);
  const address = normalizeEmail(email);
  try {
    return await User.create({ ...fields, email: address, emailVerifiedAt: new Date() });
  } catch (error) {
    // Another request created the same account first
    if (error.code !== 11000) throw error;
    return claimAccount(await findByEmail(address));
  }
};

/**
 * Activates the account for someone who has both its password and the code from its mailbox.
 * The owner never knows a password an attacker chose, so the owner's code cannot activate it.
 */
const confirmEmailWithCode = async ({ email, password, code }) => {
  const user = await findByEmail(email);
  if (!user || !await user.comparePassword(password)) {
    return { error: 'Incorrect email or password', status: 400 };
  }
  if (!awaitsVerification(user)) return { error: INVALID_CODE, status: 400 };
  const hasTriesLeft = consumeQuota({
    scope: 'verify-code',
    key: user.email,
    maxRequests: CODE_TRIES_PER_ADDRESS_PER_DAY,
    windowMs: DAY,
  });
  if (!hasTriesLeft) return { error: 'too many requests', status: 429 };
  if (!await useVerificationCode(user, code)) return { error: INVALID_CODE, status: 400 };
  markOwnerConfirmed(user);
  await user.save();
  return { user };
};

/** Sends only to an account still waiting, and answers alike for an address without one. */
const resendVerificationCode = async (email) => {
  if (!validator.isEmail(email.trim())) {
    return { error: 'Please enter a valid email address', status: 400 };
  }
  const address = normalizeEmail(email);
  if (!hasMailQuota(address)) return { error: 'too many requests', status: 429 };
  const user = await findByEmail(address);
  if (!user || !awaitsVerification(user)) return {};
  try {
    await sendVerificationMail(user);
  } catch (error) {
    console.error('verification mail failed:', error.message);
    return { error: 'Verification email could not be sent', status: 503 };
  }
  return {};
};

/** Always behaves the same, so nobody can use it to find out which addresses have accounts. */
const requestPasswordReset = async (email, app) => {
  if (typeof email !== 'string' || !validator.isEmail(email.trim())) return;
  const user = await findByEmail(email);
  if (!user || !hasMailQuota(user.email)) return;
  try {
    await sendResetMail(user, appOf(app));
  } catch (error) {
    console.error('password reset mail failed:', error.message);
  }
};

/** The link proves ownership, so this also confirms the address and ends other sessions. */
const resetPassword = async (token, password) => {
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  const record = await consumeResetToken(token);
  if (!record) return { error: 'invalid-link' };
  const user = await User.findById(record.userId);
  if (!user) return { error: 'invalid-link' };
  user.password = password;
  user.sessionVersion = (user.sessionVersion ?? 0) + 1;
  markOwnerConfirmed(user);
  await user.save();
  await AccountToken.deleteMany({ userId: user._id, purpose: 'verify-email' });
  return { user, app: record.app };
};

module.exports = {
  MIN_PASSWORD_LENGTH,
  appOf,
  awaitsVerification,
  claimAccount,
  confirmEmailWithCode,
  findByEmail,
  loginUrlOf,
  normalizeEmail,
  passwordProblem,
  registerWithPassword,
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  signInWithConfirmedEmail,
};
