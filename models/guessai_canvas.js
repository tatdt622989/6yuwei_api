const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const guessaiCanvasSimpleUserSchema = new mongoose.Schema({
  name: String,
  photo: String,
  score: Number,
}, { timestamps: true });

// generate jwt token
guessaiCanvasSimpleUserSchema.methods.generateAuthToken = function () {
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

const GuessAICanvasSimpleUser = mongoose.model('GuessAICanvasSimpleUser', guessaiCanvasSimpleUserSchema);

module.exports = GuessAICanvasSimpleUser;
