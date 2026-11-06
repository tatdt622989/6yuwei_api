const mongoose = require('mongoose');
const { editorDb, readerDb } = require('./dictConnections');

// services/dictWords.js and the collection validator hold the field rules.
// The limited database accounts cannot create collections, so autoCreate stays off
const dictWordSchema = () => new mongoose.Schema({ _id: String }, {
  collection: 'dict_words', strict: false, versionKey: false, autoCreate: false,
});

const dictWordHistorySchema = new mongoose.Schema({
  wordId: { type: String, required: true },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  revision: { type: Number, required: true },
  editor: { userId: String, username: String },
  at: { type: Date, default: Date.now },
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
}, { collection: 'dict_words_history', versionKey: false, autoCreate: false });
dictWordHistorySchema.index({ wordId: 1, at: -1 });

const DictWord = editorDb.models.DictWord || editorDb.model('DictWord', dictWordSchema());
const DictWordHistory = editorDb.models.DictWordHistory || editorDb.model('DictWordHistory', dictWordHistorySchema);
// Public routes read through this model, on the account that cannot change words
const DictWordReader = readerDb.models.DictWordReader || readerDb.model('DictWordReader', dictWordSchema());

module.exports = { DictWord, DictWordHistory, DictWordReader };
