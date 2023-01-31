const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  email: String,
  phone: String,
});

userSchema.pre('save', async function (next) {
  const user = this; // document
  if (user.isModified('password')) {
    user.password = await bcrypt.hash(user.password, 10);
  }
  next();
});

// compare password
userSchema.methods.comparePassword = async function (password) {
  const user = this; // document
  const isPass = await bcrypt.compare(password, user.password);
  return isPass;
};

// generate jwt token
userSchema.methods.generateAuthToken = function () {
  const user = this; // document

  // eslint-disable-next-line no-underscore-dangle
  if (!user._id) {
    throw new Error('User must be saved before generating an auth token');
  }

  // jwt token
  const token = jwt.sign(
    {
      // eslint-disable-next-line no-underscore-dangle
      userId: user._id,
    },
    process.env.SECRET_KEY,
    { expiresIn: process.env.TOKEN_EXPIRES_IN },
  );
  return token;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
