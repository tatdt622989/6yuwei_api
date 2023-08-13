const mongoose = require('mongoose');

// 元件類型
const componentTypeSchema = new mongoose.Schema({
  title: String,
  description: String,
  html: String,
  javascript: String,
  blink: String,
}, { timestamps: true });

const ComponentType = mongoose.model('ComponentType', componentTypeSchema);

exports.ComponentType = ComponentType;

// 元件
const componentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  componentsType: { type: mongoose.Schema.Types.ObjectId, ref: 'ComponentType' },
  title: String,
  styleFileName: String,
}, { timestamps: true });

const Component = mongoose.model('Component', componentSchema);

exports.Component = Component;
