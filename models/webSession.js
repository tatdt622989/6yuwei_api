const mongoose = require('mongoose');

// Token handler sessions (6yuwei_auth/docs/data.md §3.2). _id is the SHA-256 of the cookie value
const webSessionSchema = new mongoose.Schema({
  _id: String,
  sub: { type: String, required: true, index: true },
  roles: { type: [String], default: [] },
  idpSid: { type: String, index: true },
  refreshToken: { type: String, required: true },
  app: { type: String, required: true },
  display: {
    name: String, email: String, picture: String,
  },
  checkedAt: { type: Date, required: true },
  checkLockUntil: Date,
  lastSeenAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}, { collection: 'web_sessions', versionKey: false, timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.models.WebSession || mongoose.model('WebSession', webSessionSchema);
