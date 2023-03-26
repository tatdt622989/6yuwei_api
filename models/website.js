const mongoose = require('mongoose');

const websiteSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: String,
  externalLink: String,
  photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
  textEditor: String,
  category: String,
});

const Website = mongoose.model('Website', websiteSchema);

module.exports = Website;
