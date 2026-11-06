const mongoose = require('mongoose');
const { readerDb } = require('./dictConnections');

// The practice data the app has always written, next to dict_words
const practiceRecordSchema = new mongoose.Schema({}, {
  collection: 'practice_records', strict: false, versionKey: false, autoCreate: false,
});

const vocabularyStatSchema = new mongoose.Schema({
  userId: String,
  wordId: String,
  level: String,
}, {
  collection: 'vocabulary_stats', strict: false, versionKey: false, autoCreate: false,
});
vocabularyStatSchema.index({ userId: 1, wordId: 1 });

const PracticeRecord = readerDb.models.PracticeRecord || readerDb.model('PracticeRecord', practiceRecordSchema);
const VocabularyStat = readerDb.models.VocabularyStat || readerDb.model('VocabularyStat', vocabularyStatSchema);

module.exports = { PracticeRecord, VocabularyStat };
