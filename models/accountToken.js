const mongoose = require('mongoose');

// One-time links and codes sent by email. Only a hash is stored, so a database copy cannot use them
const accountTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  purpose: { type: String, required: true, enum: ['verify-email', 'reset-password'] },
  tokenHash: { type: String, required: true, unique: true },
  app: { type: String, default: 'main' },
  // Wrong tries so far. A short code has to stop accepting guesses
  attempts: { type: Number, default: 0 },
  // MongoDB removes the record once this time passes
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { collection: 'account_tokens' });

module.exports = mongoose.model('AccountToken', accountTokenSchema);
