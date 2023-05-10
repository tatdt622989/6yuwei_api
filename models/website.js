const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
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

const Website = mongoose.model('Website', websiteSchema);

module.exports = Website;
