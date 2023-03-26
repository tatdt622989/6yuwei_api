const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  url: String,
  description: String,
});

const Photo = mongoose.model('Photo', photoSchema);

module.exports = Photo;
