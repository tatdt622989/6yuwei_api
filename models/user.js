const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String },
  email: { type: String, required: true, unique: true },
  phone: String,
  photo: String,
  externalPhoto: String,
  country: String,
  birth: Date,
  balance: { type: Number, default: 30 },
  permissions: { type: String, default: 'general', enum: ['general', 'admin'] },
  favoriteComponents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Component' }],
  appleId: { type: String },
  appleRefreshToken: { type: String },
}, { timestamps: true });

userSchema.pre('save', async function () {
  const user = this; // document
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 10);
  }
});

/**
 * The account for this email, created from fields when there is none.
 * An existing account stays unchanged. */
userSchema.statics.findOrCreateByEmail = async function (email, fields) {
  const existing = await this.findOne({ email: { $eq: email } });
  if (existing) {
    return existing;
  }
  try {
    return await this.create({ ...fields, email });
  } catch (err) {
    // Another request created the same account first
    if (err.code !== 11000) {
      throw err;
    }
    return this.findOne({ email: { $eq: email } });
  }
};

// compare password
userSchema.methods.comparePassword = async function (password) {
  const user = this; // document
  // Accounts made through Google or Apple have no password
  if (!user.password || typeof password !== 'string') {
    return false;
  }
  const isPass = await bcrypt.compare(password, user.password);
  return isPass;
};

// generate jwt token
userSchema.methods.generateAuthToken = function () {
  const user = this; // document

  if (!user.id) {
    throw new Error('User must be saved before generating an auth token');
  }

  // jwt token
  const token = jwt.sign(
    {
      userId: user.id,
    },
    process.env.SECRET_KEY,
    { expiresIn: process.env.TOKEN_EXPIRES_IN },
  );
  return token;
};

const User = mongoose.model('User', userSchema);

const userTransitionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  type: String,
  ip: String,
}, { timestamps: true });

const UserTransition = mongoose.model('UserTransition', userTransitionSchema);

module.exports = {
  User,
  UserTransition,
};
