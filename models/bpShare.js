const mongoose = require('mongoose');

// One family link per account. Only the hash of the link's token is stored
const bpShareSchema = new mongoose.Schema({
  owner: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { collection: 'bp_shares', versionKey: false });

bpShareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.BpShare || mongoose.model('BpShare', bpShareSchema);
