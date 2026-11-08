const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseChange } = require('../services/bpEntries');
const { answerOf, normalizeResult, parseModelJson } = require('../services/bpOcr');

const NOW = Date.UTC(2026, 10, 8);

const reading = (data = {}) => ({
  kind: 'reading',
  id: 'abc-123',
  updatedAt: NOW,
  data: {
    takenAt: NOW, systolic: 128, diastolic: 82, pulse: 71, ...data,
  },
});

test('keeps only the known fields of a reading', () => {
  const entry = parseChange(reading({ arm: 'left', $where: 'evil', tags: ['coffee', 'coffee', 5] }), NOW);
  assert.equal(entry.data.systolic, 128);
  assert.equal(entry.data.arm, 'left');
  assert.deepEqual(entry.data.tags, ['coffee']);
  assert.equal('$where' in entry.data, false);
});

test('refuses readings outside the plausible range', () => {
  assert.equal(parseChange(reading({ systolic: 999 }), NOW), null);
  assert.equal(parseChange(reading({ diastolic: '82' }), NOW), null);
  assert.equal(parseChange(reading({ pulse: 900 }), NOW), null);
  assert.equal(parseChange(reading({ takenAt: NOW * 2 }), NOW), null);
});

test('refuses unknown kinds, including inherited property names', () => {
  assert.equal(parseChange({ ...reading(), kind: 'constructor' }, NOW), null);
  assert.equal(parseChange({ ...reading(), kind: ['reading'] }, NOW), null);
  assert.equal(parseChange({ ...reading(), id: { $ne: 1 } }, NOW), null);
});

test('a deleted entry carries no data', () => {
  const entry = parseChange({
    kind: 'reading', id: 'abc', updatedAt: NOW, deleted: true, data: { note: 'secret' },
  }, NOW);
  assert.equal(entry.data, null);
  assert.equal(entry.deleted, true);
});

test('pulls a client clock from the future back to the server time', () => {
  const entry = parseChange({ ...reading(), updatedAt: NOW + 1e9 }, NOW);
  assert.equal(entry.clientUpdatedAt, NOW);
});

test('normalizes model output and drops impossible values', () => {
  const result = normalizeResult({
    found: true, systolic: 128.4, diastolic: 900, pulse: 'x', confidence: 3, unit: 'mmHg', uncertainDigits: ['pulse', 'evil'],
  });
  assert.equal(result.systolic, 128);
  assert.equal(result.diastolic, null);
  assert.equal(result.pulse, null);
  assert.equal(result.confidence, 1);
  assert.deepEqual(result.uncertainDigits, ['pulse']);
});

test('converts kPa to mmHg but leaves the pulse alone', () => {
  const result = normalizeResult({
    found: true, systolic: 16, diastolic: 10.7, pulse: 70, confidence: 0.9, unit: 'kPa',
  });
  assert.equal(result.systolic, 120);
  assert.equal(result.diastolic, 80);
  assert.equal(result.pulse, 70);
});

test('reports nothing found when no pressure could be read', () => {
  assert.equal(normalizeResult({ found: true, systolic: null, diastolic: null }).found, false);
  assert.equal(normalizeResult(null).found, false);
});

test('reads model JSON with or without a code fence', () => {
  assert.deepEqual(parseModelJson('{"found":true}'), { found: true });
  assert.deepEqual(parseModelJson('```json\n{"found":true}\n```'), { found: true });
});

test('a declined request counts as nothing found', () => {
  const answer = answerOf({ stop_reason: 'refusal', content: [] });
  assert.equal(answer, null);
  assert.equal(normalizeResult(answer).found, false);
});

test('reads the text block and skips thinking blocks', () => {
  const answer = answerOf({
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"found":true}' }],
  });
  assert.deepEqual(answer, { found: true });
});

test('an answer with no text is an error, not an empty reading', () => {
  assert.throws(() => answerOf({ stop_reason: 'max_tokens', content: [] }), /max_tokens/);
});
