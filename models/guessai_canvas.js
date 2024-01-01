const mongoose = require('mongoose');

const guessaiCanvasSimpleUserSchema = new mongoose.Schema({
  name: String,
  photo: String,
  score: Number,
}, { timestamps: true });

const GuessAICanvasSimpleUser = mongoose.model('GuessAICanvasSimpleUser', guessaiCanvasSimpleUserSchema);

module.exports = GuessAICanvasSimpleUser;
