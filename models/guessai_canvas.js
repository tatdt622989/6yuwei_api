const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// 使用者
const simpleUserSchema = new mongoose.Schema({
  name: String,
  photo: String,
  score: Number,
}, { timestamps: true });

// generate jwt token
simpleUserSchema.methods.generateAuthToken = function () {
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
    { expiresIn: '1y' },
  );
  return token;
};
const SimpleUser = mongoose.model('SimpleUser', simpleUserSchema);

// 猜AI畫布
const guessaiCanvasSchema = new mongoose.Schema({
  canvas: String,
  answerTW: String,
  answerEN: String,
  answerJP: String,
  correctRespondent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimpleUser',
  },
}, { timestamps: true });
const GuessAICanvas = mongoose.model('GuessAICanvas', guessaiCanvasSchema);

// 對話訊息
const messageSchema = new mongoose.Schema({
  message: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SimpleUser',
  },
  isCorrect: Boolean,
}, { timestamps: true });
const Messages = mongoose.model('Messages', messageSchema);

module.exports = {
  SimpleUser,
  GuessAICanvas,
  Messages,
};
