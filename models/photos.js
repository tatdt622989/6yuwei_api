const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  permissions: {
    read: { type: [String], enum: ['admin'], default: ['admin'] },
    write: { type: [String], enum: ['admin'], default: ['admin'] },
  },
  url: String,
  size: Number,
  mimetype: String,
  ext: String,
  description: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const Photo = mongoose.model('Photo', photoSchema);

module.exports = Photo;
