const { LEVELS } = require('./dictWords');

const MAX_QUESTIONS = 200;
const MAX_EXAMPLES = 3;
const FORM_ID_SEPARATOR = '|';
const LEGACY_ID = /^n[1-5]_\d+$/;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

const first = (path) => ({ $arrayElemAt: [path, 0] });

/** One row per quiz entry at this level: the word itself and each form tagged with the level. */
const levelRowsPipeline = (level) => [
  { $match: { $or: [{ levels: level }, { 'forms.level': level }] } },
  {
    $project: {
      rows: {
        $concatArrays: [
          {
            $cond: [{ $in: [level, '$levels'] }, [{
              written: '$_id',
              kana: first('$readings'),
              romaji: first('$romaji'),
              meanings: '$meanings',
              category: first('$categories'),
              examples: { $slice: ['$examples', MAX_EXAMPLES] },
            }], []],
          },
          {
            $map: {
              input: { $filter: { input: '$forms', cond: { $eq: ['$$this.level', level] } } },
              in: {
                isForm: { $literal: true },
                written: '$$this.written',
                kana: '$$this.kana',
                romaji: '$$this.romaji',
                meanings: ['$$this.zh'],
                category: first('$categories'),
                examples: { $slice: ['$$this.examples', MAX_EXAMPLES] },
              },
            },
          },
        ],
      },
    },
  },
  { $unwind: '$rows' },
];

const wordIdOf = (row) => (row.isForm
  ? [row.word, row.written, row.kana].join(FORM_ID_SEPARATOR)
  : row.word);

const toExamples = (examples) => (examples || []).map((e) => ({ chinese: e.zh, japanese: e.ja }));

const toQuestion = (row, index) => ({
  id: `q_${index + 1}`,
  wordId: wordIdOf(row),
  chinese: row.meanings.join('／'),
  correctAnswer: row.written,
  reading: row.romaji,
  kana: row.kana,
  category: row.category || '',
  examples: toExamples(row.examples),
});

const baseRow = (doc) => ({
  word: doc._id,
  written: doc._id,
  kana: doc.readings[0],
  kanas: doc.readings,
  romaji: doc.romaji[0],
  romajis: doc.romaji,
  meanings: doc.meanings,
  category: doc.categories?.[0],
  examples: doc.examples,
});

const formRow = (doc, form) => ({
  isForm: true,
  word: doc._id,
  written: form.written,
  kana: form.kana,
  kanas: [form.kana],
  romaji: form.romaji,
  romajis: [form.romaji],
  meanings: [form.zh],
  category: doc.categories?.[0],
  examples: form.examples,
});

/** Finds the row for an ID in a word's document, or null. */
function rowFromDoc(doc, wordId) {
  const [, written, kana] = wordId.split(FORM_ID_SEPARATOR);
  if (written === undefined) return baseRow(doc);
  const form = (doc.forms || []).find((f) => f.written === written && f.kana === kana);
  return form ? formRow(doc, form) : null;
}

/**
 * Older app data holds IDs such as n5_036. One old ID can belong to several words,
 * so the answer picks between them when it matches one.
 */
function rowFromLegacy(docs, legacyId, answer) {
  const rows = docs.flatMap((doc) => [
    ...((doc.legacyIds || []).includes(legacyId) ? [baseRow(doc)] : []),
    ...(doc.forms || [])
      .filter((f) => (f.legacyIds || []).includes(legacyId))
      .map((f) => formRow(doc, f)),
  ]);
  return rows.find((row) => row.written === answer) || rows[0] || null;
}

const toCheckResult = (row, answer) => {
  const userAnswer = answer.trim();
  const wordId = wordIdOf(row);
  return {
    success: true,
    wordId,
    isCorrect: userAnswer === row.written,
    userAnswer,
    correctAnswer: row.written,
    allCorrectAnswers: [row.written],
    allCorrectReadings: row.romajis,
    allCorrectKana: row.kanas,
    word: {
      chinese: row.meanings.join('／'),
      japanese: row.written,
      reading: row.romaji,
      category: row.category || '',
      examples: toExamples(row.examples),
    },
  };
};

const parseLevel = (value) => {
  const level = typeof value === 'string' ? value.toUpperCase() : '';
  return LEVELS.includes(level) ? level : null;
};

const parseQuestionCount = (value) => {
  const count = Number.parseInt(value, 10);
  if (!Number.isInteger(count) || count < 1) return 10;
  return Math.min(count, MAX_QUESTIONS);
};

const isUserId = (value) => typeof value === 'string' && USER_ID.test(value);
const isWordId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const isLegacyId = (value) => LEGACY_ID.test(value);

module.exports = {
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
};
