const mongoose = require('mongoose');

const threeDCGSchema = new mongoose.Schema({
  permissions: {
    read: { type: [String], enum: ['admin'], default: ['admin'] },
    write: { type: [String], enum: ['admin'], default: ['admin'] },
  },
  title: String,
  description: String,
  externalLink: String,
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
  textEditor: String,
  category: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visible: { type: Boolean, default: true },
  homepage: { type: Boolean, default: false },
}, { timestamps: true });

const ThreeDCG = mongoose.model('ThreeDCG', threeDCGSchema);

module.exports = ThreeDCG;
