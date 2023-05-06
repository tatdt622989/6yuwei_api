const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.6yuwei.com',
  port: 465,
  secure: true,
  auth: {
    user: '',
    pass: '',
  },
});

const contactSchema = new mongoose.Schema({
  email: String,
  message: String,
}, { timestamps: true });

const Contact = mongoose.model('Contact', contactSchema);

module.exports = Contact;
