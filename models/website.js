const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: String,
  externalLink: String,
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photos' }],
  textEditor: String,
  category: String,
}, { timestamps: true });

const Website = mongoose.model('Website', websiteSchema);

module.exports = Website;
