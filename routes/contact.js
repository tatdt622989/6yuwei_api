/* eslint-disable no-underscore-dangle */
const express = require('express');

const router = express.Router();
const multer = require('multer');
// const nodemailer = require('nodemailer');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const validator = require('validator');
const Contact = require('../models/contact');
const { requireAdmin } = require('../middlewares/auth');

const upload = multer();

// 表單提交
router.post('/', upload.none(), async (req, res) => {
  const { email, message } = req.body;
  const token = req.body['g-recaptcha-response'];
  const form = new FormData();
  form.append('secret', process.env.RECAPTCHA_SECRET_KEY);
  form.append('response', token);
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(email)) {
    return res.status(400).send('Invalid email');
  }
  if (!message) {
    return res.status(400).send('Message cannot be empty');
  }
  const recaptchaRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    body: form,
  });
  if (recaptchaRes.ok) {
    const json = await recaptchaRes.json();
    const { success, score } = json;
    if (!success || score < 0.5) {
      return res.status(403).send('Recaptcha failed');
    }
  } else {
    return res.status(500).send('Recaptcha failed');
  }
  try {
    const contact = new Contact({
      email,
      message,
    });
    await contact.save();
  } catch (err) {
    return res.status(500).send('Failed to save');
  }

  try {
    const defaultClient = SibApiV3Sdk.ApiClient.instance;

    // Configure API key authorization: api-key
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.MAIL_API_KEY;

    // Uncomment below two lines to configure authorization using: partner-key
    // var partnerKey = defaultClient.authentications['partner-key'];
    // partnerKey.apiKey = 'YOUR API KEY';

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    sendSmtpEmail = {
      sender: {
        name: '6yuwei',
        email: 'contact@6yuwe.com',
      },
      to: [{
        email: '70212cbkj67@gmail.com',
        name: '6yuwei',
      }],
      htmlContent: `<!DOCTYPE html> <html> <body><h1>官網聯絡表單-${email}</h1><hr><p>${message}</p></html>`,
      subject: `官網聯絡表單-${email}`,
      headers: {
        'X-Mailin-custom': 'custom_header_1:custom_value_1|custom_header_2:custom_value_2',
      },
      replyTo: {
        email,
        name: 'customer',
      },
    };

    await new Promise((resolve, reject) => {
      apiInstance.sendTransacEmail(sendSmtpEmail).then(() => {
        resolve();
      }, (error) => {
        console.error(error);
        reject(error);
      });
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to send');
  }

  // try {
  //   const transporter = nodemailer.createTransport({
  //     host: process.env.MAIL_HOST,
  //     port: process.env.MAIL_PORT,
  //     secure: true,
  //     auth: {
  //       user: process.env.MAIL_USER,
  //       pass: process.env.MAIL_PASSWORD,
  //     },
  //   });
  //   console.log('Creating transporter...');
  //   const mailRes = await new Promise((resolve, reject) => {
  //     transporter.sendMail({
  //       from: process.env.MAIL_USER,
  //       to: `${process.env.MAIL_USER},${process.env.MAIL_USER2}`,
  //       subject: '官網聯絡表單',
  //       text: `Email: ${email}\nMessage: ${message}`,
  //     }, (error, info) => {
  //       if (error) {
  //         console.log(error);
  //         reject(error);
  //       } else {
  //         resolve(info);
  //       }
  //     });
  //   });
  //   console.log('Message sent:', mailRes);
  // } catch (err) {
  //   console.log(err);
  //   return res.status(500).send('Failed to send');
  // }

  return res.json({
    msg: 'Successful send',
  });
});

// 列出資料(有權限)
router.get('/admin/list/', requireAdmin, async (req, res) => {
  if (!req.query.page) {
    return res.status(400).send('Lack of essential information');
  }
  let keyword = req.query.keyword || '';
  keyword = validator.escape(keyword);
  const regex = new RegExp(keyword, 'i');
  const page = req.query.page || 1;
  const pageSize = 12;
  const skip = (page - 1) * pageSize; // 跳過幾筆
  try {
    const total = await Contact.countDocuments({
      $or: [{ email: { $regex: regex } }, { message: { $regex: regex } }],
    });
    const list = await Contact.find({
      $or: [{ email: { $regex: regex } }, { message: { $regex: regex } }],
    })
      .skip(skip)
      .limit(pageSize)
      .sort({ createdAt: 'desc' })
      .exec();
    return res.json({
      msg: 'Successful query',
      list,
      pageSize,
      currentPage: page,
      total,
      totalPage: Math.ceil(total / pageSize),
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to query');
  }
});

// 刪除多筆資料(有權限)
router.post('/admin/list/delete/', requireAdmin, async (req, res) => {
  if (!req.body || !req.body.ids) {
    return res.status(400).send('Lack of essential information');
  }
  const { ids } = req.body;

  if (!Array.isArray(ids)) {
    return res.status(400).send('ids must be an array');
  }

  try {
    const deletedData = await Contact.deleteMany({ _id: { $in: ids } });
    const { title } = deletedData;
    return res.json({
      msg: `Successful delete ${title}`,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send('Failed to delete');
  }
});

module.exports = router;
