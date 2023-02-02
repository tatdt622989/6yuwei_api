const mongoose = require('mongoose');

const tokenBlackListSchema = new mongoose.Schema({
  token: String,
  issuedAt: Date,
  expiresAt: Date,
});

const TokenBlackList = mongoose.model('TokenBlackList', tokenBlackListSchema);

module.exports = TokenBlackList;
