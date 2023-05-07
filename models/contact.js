const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  email: String,
  message: String,
}, { timestamps: true });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
