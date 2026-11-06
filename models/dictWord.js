const mongoose = require('mongoose');

const dictDbName = process.env.DICT_DB_NAME || 'japanese_learning_app';
const dictDb = mongoose.connection.useDb(dictDbName, { useCache: true });

// services/dictWords.js and the collection validator hold the field rules
const dictWordSchema = new mongoose.Schema({ _id: String }, { collection: 'dict_words', strict: false, versionKey: false });

const dictWordHistorySchema = new mongoose.Schema({
  wordId: { type: String, required: true },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  revision: { type: Number, required: true },
  editor: { userId: String, username: String },
  at: { type: Date, default: Date.now },
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
}, { collection: 'dict_words_history', versionKey: false });
dictWordHistorySchema.index({ wordId: 1, at: -1 });

const DictWord = dictDb.models.DictWord || dictDb.model('DictWord', dictWordSchema);
const DictWordHistory = dictDb.models.DictWordHistory || dictDb.model('DictWordHistory', dictWordHistorySchema);

module.exports = { DictWord, DictWordHistory };
