const mongoose = require('mongoose');

// The practice data the app has always written, kept in its original database
const practiceDbName = process.env.PRACTICE_DB_NAME || 'japanese_learning_app';
const practiceDb = mongoose.connection.useDb(practiceDbName, { useCache: true });

const practiceRecordSchema = new mongoose.Schema({}, { collection: 'practice_records', strict: false, versionKey: false });

const vocabularyStatSchema = new mongoose.Schema({
  userId: String,
  wordId: String,
  level: String,
}, { collection: 'vocabulary_stats', strict: false, versionKey: false });
vocabularyStatSchema.index({ userId: 1, wordId: 1 });

const PracticeRecord = practiceDb.models.PracticeRecord || practiceDb.model('PracticeRecord', practiceRecordSchema);
const VocabularyStat = practiceDb.models.VocabularyStat || practiceDb.model('VocabularyStat', vocabularyStatSchema);

module.exports = { PracticeRecord, VocabularyStat };
