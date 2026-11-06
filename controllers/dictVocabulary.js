const { DictWord } = require('../models/dictWord');
const { PracticeRecord, VocabularyStat } = require('../models/dictPractice');
const {
  FORM_ID_SEPARATOR,
  isLegacyId,
  isUserId,
  isWordId,
  levelRowsPipeline,
  parseLevel,
  parseQuestionCount,
  rowFromDoc,
  rowFromLegacy,
  toCheckResult,
  toQuestion,
} = require('../services/dictVocabulary');
const { LEVELS } = require('../services/dictWords');

const guard = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    console.error('dict vocabulary request failed:', error.message);
    res.status(500).json({ error: 'db error' });
  }
};

async function findRow(wordId, answer) {
  if (isLegacyId(wordId)) {
    const docs = await DictWord.find({ allLegacyIds: wordId }).sort({ order: 1 }).lean();
    return rowFromLegacy(docs, wordId, answer);
  }
  const doc = await DictWord.findById(wordId.split(FORM_ID_SEPARATOR)[0]).lean();
  return doc ? rowFromDoc(doc, wordId) : null;
}

const stats = guard(async (req, res) => {
  const [counts, totals] = await Promise.all([
    DictWord.aggregate([
      { $project: { levels: { $concatArrays: ['$levels', { $ifNull: ['$forms.level', []] }] } } },
      { $unwind: '$levels' },
      { $group: { _id: '$levels', count: { $sum: 1 } } },
    ]),
    DictWord.aggregate([{ $group: { _id: null, words: { $sum: 1 }, forms: { $sum: '$formCount' } } }]),
  ]);
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, { count: 0, categories: [] }]));
  counts.forEach(({ _id, count }) => {
    if (byLevel[_id]) byLevel[_id].count = count;
  });
  res.json({
    success: true,
    totalLevels: LEVELS.length,
    totalWords: (totals[0]?.words ?? 0) + (totals[0]?.forms ?? 0),
    stats: byLevel,
  });
});

const questions = guard(async (req, res) => {
  const level = parseLevel(req.query.level);
  if (!level) {
    res.status(400).json({ error: 'level must be one of N5, N4, N3, N2, N1' });
    return;
  }
  const size = parseQuestionCount(req.query.questionCount);
  const rows = await DictWord.aggregate([
    ...levelRowsPipeline(level),
    { $sample: { size } },
  ]);
  const items = rows.map(({ _id, rows: row }, index) => toQuestion({ ...row, word: _id }, index));
  res.json({
    success: true,
    level,
    mode: 'normal',
    totalQuestions: items.length,
    questions: items,
  });
});

const check = guard(async (req, res) => {
  const { wordId, userAnswer } = req.body || {};
  if (!isWordId(wordId) || typeof userAnswer !== 'string' || !userAnswer.trim()) {
    res.status(400).json({ error: 'wordId and userAnswer are required' });
    return;
  }
  const row = await findRow(wordId, userAnswer.trim());
  if (!row) {
    res.status(404).json({ error: 'word not found' });
    return;
  }
  res.json(toCheckResult(row, userAnswer));
});

const record = guard(async (req, res) => {
  const {
    userId, wordId, isCorrect, userAnswer,
  } = req.body || {};
  const level = parseLevel(req.body?.level);
  const answer = typeof userAnswer === 'string' ? userAnswer.slice(0, 200) : '';
  if (!isUserId(userId) || !isWordId(wordId) || typeof isCorrect !== 'boolean' || !level) {
    res.status(400).json({ error: 'userId, wordId, isCorrect and level are required' });
    return;
  }
  const row = await findRow(wordId, answer.trim());
  if (!row) {
    res.status(404).json({ error: 'word not found' });
    return;
  }

  const now = new Date();
  const { wordId: currentId } = toCheckResult(row, answer);
  await PracticeRecord.create({
    userId,
    wordId: currentId,
    exerciseType: 'vocabulary',
    level,
    isCorrect,
    userAnswer: answer,
    timestamp: now,
    date: now.toISOString().split('T')[0],
  });
  await VocabularyStat.updateOne(
    { userId, wordId: currentId },
    {
      $inc: { totalAttempts: 1, correctAttempts: isCorrect ? 1 : 0 },
      $set: { level, lastAttemptDate: now, ...(isCorrect ? {} : { lastErrorDate: now }) },
      $setOnInsert: { createdDate: now },
    },
    { upsert: true },
  );
  res.json({ success: true });
});

const userStats = guard(async (req, res) => {
  const { userId } = req.params;
  if (!isUserId(userId)) {
    res.status(400).json({ error: 'invalid userId' });
    return;
  }
  const filter = { userId };
  if (req.query.level !== undefined) {
    const level = parseLevel(req.query.level);
    if (!level) {
      res.status(400).json({ error: 'level must be one of N5, N4, N3, N2, N1' });
      return;
    }
    filter.level = level;
  }
  const [total] = await VocabularyStat.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalWords: { $sum: 1 },
        totalAttempts: { $sum: '$totalAttempts' },
        totalCorrect: { $sum: '$correctAttempts' },
      },
    },
  ]);
  const totalAttempts = total?.totalAttempts ?? 0;
  const totalCorrect = total?.totalCorrect ?? 0;
  res.json({
    success: true,
    userId,
    totalWords: total?.totalWords ?? 0,
    totalAttempts,
    totalCorrect,
    overallAccuracy: totalAttempts > 0 ? totalCorrect / totalAttempts : 0,
  });
});

module.exports = {
  check,
  questions,
  record,
  stats,
  userStats,
};
