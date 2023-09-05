const mongoose = require('mongoose');

const animationSchema = new mongoose.Schema({
  permissions: {
    read: { type: [String], enum: ['admin'], default: ['admin'] },
    write: { type: [String], enum: ['admin'], default: ['admin'] },
  },
  title: String,
  description: String,
  externalLink: String,
  youtubeURL: String,
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
  textEditor: String,
  category: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visible: { type: Boolean, default: true },
  homepage: { type: Boolean, default: false },
  top: { type: Boolean, default: false },
  sort: { type: Number, default: 0 },
}, { timestamps: true });

const Animation = mongoose.model('Animation', animationSchema);

module.exports = Animation;
