const mongoose = require('mongoose');

// One sign-in in progress (data.md §3.3). _id is the SHA-256 of the state
const webLoginStateSchema = new mongoose.Schema({
  _id: String,
  codeVerifier: { type: String, required: true },
  nonce: { type: String, required: true },
  app: { type: String, required: true },
  returnTo: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { collection: 'web_login_states', versionKey: false });

module.exports = mongoose.models.WebLoginState || mongoose.model('WebLoginState', webLoginStateSchema);
