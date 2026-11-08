const mongoose = require('mongoose');

// One row per reading, medication, intake or settings document of the blood pressure diary.
// `data` holds only the fields services/bpEntries.js allows, so client keys never reach MongoDB
const bpEntrySchema = new mongoose.Schema({
  owner: { type: String, required: true },
  kind: { type: String, required: true },
  clientId: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
  deleted: { type: Boolean, default: false },
  clientUpdatedAt: { type: Number, required: true },
  syncedAt: { type: Date, required: true },
}, { collection: 'bp_entries', versionKey: false, minimize: false });

bpEntrySchema.index({ owner: 1, kind: 1, clientId: 1 }, { unique: true });
bpEntrySchema.index({ owner: 1, syncedAt: 1 });

module.exports = mongoose.models.BpEntry || mongoose.model('BpEntry', bpEntrySchema);
