const validator = require('validator');
const { escapeRegex, isText } = require('../services/text');
const Contact = require('../models/contact');

const submitForm = async (req, res) => {
  const { email, message } = req.body;
  const token = req.body['g-recaptcha-response'];
  const form = new FormData();
  form.append('secret', process.env.RECAPTCHA_SECRET_KEY);
  form.append('response', token);
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (typeof email !== 'string' || !emailPattern.test(email)) {
    return res.status(400).send('Invalid email');
  }
  if (!isText(message)) {
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
    const mailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': process.env.MAIL_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: '6yuwei', email: 'contact@6yuwe.com' },
        to: [{ email: '70212cbkj67@gmail.com', name: '6yuwei' }],
        htmlContent: `<!DOCTYPE html> <html> <body><h1>官網聯絡表單-${email}</h1><hr><p>${validator.escape(message)}</p></html>`,
        subject: `官網聯絡表單-${email}`,
        replyTo: { email, name: 'customer' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!mailRes.ok) {
      throw new Error(`mail service answered ${mailRes.status}`);
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Failed to send');
  }

  return res.json({
    msg: 'Successful send',
  });
};

const getList = async (req, res) => {
  if (!req.query.page) {
    return res.status(400).send('Lack of essential information');
  }
  const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : '';
  const regex = new RegExp(escapeRegex(validator.escape(keyword)), 'i');
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
};

const deleteList = async (req, res) => {
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
};

module.exports = {
  deleteList,
  getList,
  submitForm,
};
