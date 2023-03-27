const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  url: String,
  description: String,
});

const Photos = mongoose.model('Photos', photoSchema);

module.exports = Photos;
