const mongoose = require('mongoose');

// One save per account. The save is stored as JSON text, so its keys never reach MongoDB as field names
const studioSaveSchema = new mongoose.Schema({
  _id: String,
  revision: { type: Number, required: true },
  data: { type: String, required: true },
  updatedAt: { type: Date, required: true },
}, { collection: 'studio_saves', versionKey: false });

module.exports = mongoose.models.StudioSave
  || mongoose.model('StudioSave', studioSaveSchema);
